import { prisma } from "@/lib/db";
import { RULESET_CATALOG } from "@/lib/compliance/defaults";
import type { Prisma } from "@/generated/prisma/client";

const seedState = globalThis as unknown as {
  complianceCatalogSeed: Promise<void> | undefined;
};

/**
 * Garante que as INs do catálogo do código existam no banco (uma vez por
 * instância do servidor). As INs são editáveis na Auditoria: o catálogo só
 * cria as que faltam — nunca sobrescreve uma IN existente nem recria uma
 * excluída (`deletedAt`).
 */
export function seedComplianceCatalog(): Promise<void> {
  seedState.complianceCatalogSeed ??= writeComplianceCatalog().catch((err) => {
    seedState.complianceCatalogSeed = undefined;
    throw err;
  });
  return seedState.complianceCatalogSeed;
}

async function writeComplianceCatalog() {
  const existing = await prisma.complianceRuleset.findMany({
    select: { version: true, deletedAt: true, editedAt: true },
  });
  const byVersion = new Map(existing.map((r) => [r.version, r]));

  for (const item of RULESET_CATALOG) {
    const jurisdiction = item.jurisdiction ?? "FEDERAL";
    const kind = item.kind ?? "BOTH";
    const row = byVersion.get(item.version);
    if (!row) {
      await prisma.complianceRuleset.create({
        data: {
          version: item.version,
          sourceCode: item.sourceCode,
          sourceUrl: item.sourceUrl,
          jurisdiction,
          kind,
          effectiveFrom: new Date(item.effectiveFrom),
          effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
          caps: item.caps as unknown as Prisma.InputJsonValue,
          planning: (item.planning ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
          legalSummary: item.legalSummary,
          jurisprudenceNotes: item.jurisprudenceNotes,
          status: item.status,
          needsReview: false,
          notes: item.notes || null,
        },
      });
      continue;
    }
    // Parâmetros de Planejamento seguem vindo do código (não são editados na Auditoria).
    if (!row.deletedAt) {
      await prisma.complianceRuleset.update({
        where: { version: item.version },
        data: {
          planning: (item.planning ?? null) as unknown as Prisma.InputJsonValue | undefined,
          kind,
          ...(row.editedAt ? {} : { jurisdiction }),
        },
      });
    }
  }

  // Sem nenhuma IN padrão (ativa) federal, a vigente do catálogo assume.
  const active = await prisma.complianceRuleset.findFirst({
    where: { status: "active", jurisdiction: "FEDERAL", deletedAt: null },
    select: { id: true },
  });
  if (!active) {
    await prisma.complianceRuleset.updateMany({
      where: { version: "in-minc-29-2026", deletedAt: null },
      data: { status: "active", needsReview: false },
    });
  }
}
