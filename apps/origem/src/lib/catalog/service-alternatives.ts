import {
  embedText,
  parseVectorLiteral,
  persistServiceEmbeddings,
  vectorLiteral,
  weightedSimilarity,
} from "@/lib/catalog/embeddings";
import { yearCutoff } from "@/lib/catalog/pricing-insights";
import { prisma } from "@/lib/db";

export type ServiceAlternative = {
  serviceId: string;
  serviceName: string;
  supplierId: string;
  supplierName: string;
  category: string | null;
  defaultPriceUnit: string | null;
  avgRating: number;
  avgUnitPrice: number;
  similarity: number;
  betterPrice: boolean;
  betterRating: boolean;
  equal: boolean;
};

type CandidateRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  defaultPriceUnit: string | null;
  avgRating: number;
  avgPrice: number;
  supplierId: string;
  supplierName: string;
  nameDistance: number;
  descriptionDistance: number | null;
};

async function loadYearUnitAvg(
  serviceId: string,
): Promise<{ unitPrice: number | null; priceUnit: string | null }> {
  const since = yearCutoff();
  const rows = await prisma.catalogEngagement.findMany({
    where: { serviceId, hiredAt: { gte: since } },
    select: { unitPrice: true, priceUnit: true },
  });
  if (rows.length === 0) return { unitPrice: null, priceUnit: null };
  const unitPrice =
    rows.reduce((sum, r) => sum + Number(r.unitPrice), 0) / rows.length;
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.priceUnit, (counts.get(r.priceUnit) || 0) + 1);
  }
  let priceUnit: string | null = null;
  let best = 0;
  for (const [unit, n] of counts) {
    if (n > best) {
      best = n;
      priceUnit = unit;
    }
  }
  return { unitPrice, priceUnit };
}

async function ensureCurrentEmbeddings(service: {
  id: string;
  name: string;
  description: string | null;
}): Promise<{
  nameEmbedding: number[];
  descriptionEmbedding: number[] | null;
} | null> {
  const existing = await prisma.$queryRawUnsafe<
    Array<{ nameEmbedding: string | null; descriptionEmbedding: string | null }>
  >(
    `SELECT
       "nameEmbedding"::text AS "nameEmbedding",
       "descriptionEmbedding"::text AS "descriptionEmbedding"
     FROM catalog_services
     WHERE id = $1`,
    service.id,
  );

  let nameEmbedding = parseVectorLiteral(existing[0]?.nameEmbedding);
  let descriptionEmbedding = parseVectorLiteral(existing[0]?.descriptionEmbedding);

  if (!nameEmbedding) {
    nameEmbedding = await embedText(service.name);
    if (!nameEmbedding) return null;
    const desc = (service.description || "").trim();
    descriptionEmbedding = desc ? await embedText(desc) : null;
    await persistServiceEmbeddings(service.id, nameEmbedding, descriptionEmbedding);
  }

  return { nameEmbedding, descriptionEmbedding };
}

/**
 * Até 3 serviços semelhantes de outros fornecedores, com preço e avaliação
 * iguais ou melhores. Similaridade = 70% nome + 30% descrição (pgvector).
 */
export async function getServiceAlternatives(
  workspaceId: string,
  serviceId: string,
): Promise<ServiceAlternative[]> {
  try {
    const service = await prisma.catalogService.findFirst({
      where: { id: serviceId, supplier: { workspaceId } },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        defaultPriceUnit: true,
        avgRating: true,
        avgPrice: true,
        supplierId: true,
      },
    });
    if (!service) return [];

    const embeddings = await ensureCurrentEmbeddings(service);
    if (!embeddings) return [];

    const currentYear = await loadYearUnitAvg(service.id);
    const currentUnitPrice =
      currentYear.unitPrice ?? (service.avgPrice > 0 ? service.avgPrice : null);
    const currentUnit = currentYear.priceUnit ?? service.defaultPriceUnit ?? "closed";
    const currentRating = service.avgRating;
    if (currentUnitPrice == null || currentUnitPrice <= 0) return [];

    const nameLit = vectorLiteral(embeddings.nameEmbedding);
    const hasQueryDesc = embeddings.descriptionEmbedding != null;

    const candidates = hasQueryDesc
      ? await prisma.$queryRawUnsafe<CandidateRow[]>(
          `SELECT
             sp.id,
             sp.name,
             sp.description,
             sp.category,
             sp."defaultPriceUnit",
             sp."avgRating",
             sp."avgPrice",
             s.id AS "supplierId",
             s.name AS "supplierName",
             (sp."nameEmbedding" <=> $1::vector) AS "nameDistance",
             CASE
               WHEN sp."descriptionEmbedding" IS NULL THEN NULL
               ELSE (sp."descriptionEmbedding" <=> $2::vector)
             END AS "descriptionDistance"
           FROM catalog_services sp
           JOIN catalog_suppliers s ON s.id = sp."supplierId"
           WHERE s."workspaceId" = $3
             AND sp.id <> $4
             AND sp."supplierId" <> $5
             AND sp."nameEmbedding" IS NOT NULL
           ORDER BY (
             0.7 * (sp."nameEmbedding" <=> $1::vector) +
             0.3 * COALESCE(
               CASE
                 WHEN sp."descriptionEmbedding" IS NULL THEN NULL
                 ELSE (sp."descriptionEmbedding" <=> $2::vector)
               END,
               (sp."nameEmbedding" <=> $1::vector)
             )
           ) ASC
           LIMIT 20`,
          nameLit,
          vectorLiteral(embeddings.descriptionEmbedding!),
          workspaceId,
          service.id,
          service.supplierId,
        )
      : await prisma.$queryRawUnsafe<CandidateRow[]>(
          `SELECT
             sp.id,
             sp.name,
             sp.description,
             sp.category,
             sp."defaultPriceUnit",
             sp."avgRating",
             sp."avgPrice",
             s.id AS "supplierId",
             s.name AS "supplierName",
             (sp."nameEmbedding" <=> $1::vector) AS "nameDistance",
             NULL::float8 AS "descriptionDistance"
           FROM catalog_services sp
           JOIN catalog_suppliers s ON s.id = sp."supplierId"
           WHERE s."workspaceId" = $2
             AND sp.id <> $3
             AND sp."supplierId" <> $4
             AND sp."nameEmbedding" IS NOT NULL
           ORDER BY sp."nameEmbedding" <=> $1::vector
           LIMIT 20`,
          nameLit,
          workspaceId,
          service.id,
          service.supplierId,
        );

    const alternatives: ServiceAlternative[] = [];

    for (const row of candidates) {
      const peerYear = await loadYearUnitAvg(row.id);
      const peerUnit = peerYear.priceUnit ?? row.defaultPriceUnit ?? "closed";
      if (peerUnit !== currentUnit) continue;
      const peerPrice = peerYear.unitPrice ?? (row.avgPrice > 0 ? row.avgPrice : null);
      if (peerPrice == null || peerPrice <= 0) continue;
      if (row.avgRating < currentRating) continue;
      if (peerPrice > currentUnitPrice) continue;

      const betterPrice = peerPrice < currentUnitPrice * 0.995;
      const betterRating = row.avgRating > currentRating + 0.05;
      const equal = !betterPrice && !betterRating;
      const descDist =
        row.descriptionDistance == null ? null : Number(row.descriptionDistance);
      const similarity = weightedSimilarity(
        Number(row.nameDistance),
        Number.isFinite(descDist as number) ? (descDist as number) : null,
      );
      if (similarity <= 0.75) continue;

      alternatives.push({
        serviceId: row.id,
        serviceName: row.name,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        category: row.category,
        defaultPriceUnit: row.defaultPriceUnit,
        avgRating: row.avgRating,
        avgUnitPrice: peerPrice,
        similarity,
        betterPrice,
        betterRating,
        equal,
      });
    }

    alternatives.sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      const aGain =
        (a.betterPrice ? (currentUnitPrice - a.avgUnitPrice) / currentUnitPrice : 0) +
        (a.betterRating ? (a.avgRating - currentRating) / 5 : 0);
      const bGain =
        (b.betterPrice ? (currentUnitPrice - b.avgUnitPrice) / currentUnitPrice : 0) +
        (b.betterRating ? (b.avgRating - currentRating) / 5 : 0);
      return bGain - aGain;
    });

    return alternatives.slice(0, 3);
  } catch (error) {
    console.error("getServiceAlternatives failed:", error);
    return [];
  }
}

export { indexServiceEmbedding } from "@/lib/catalog/embeddings";
