import { normalizeCnaeCode } from "@/lib/catalog/cnae";
import { prisma } from "@/lib/db";

/** Busca descrição oficial da subclasse CNAE no IBGE. */
export async function fetchCnaeDescriptionFromIbge(
  raw: string,
): Promise<string | null> {
  const code = normalizeCnaeCode(raw);
  if (!code || code.length < 7) return null;

  try {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/${code}`,
      { next: { revalidate: 60 * 60 * 24 * 7 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { descricao?: string };
    const desc = data.descricao?.trim();
    return desc || null;
  } catch {
    return null;
  }
}

/** Catálogo do workspace primeiro; se não achar, IBGE. */
export async function resolveCnaeDescription(
  workspaceId: string,
  raw: string,
): Promise<string | null> {
  const code = normalizeCnaeCode(raw);
  if (!code || code.length < 7) return null;

  const fromCatalog = await prisma.catalogSupplier.findFirst({
    where: {
      workspaceId,
      cnaeCode: code,
      cnaeDescription: { not: null },
    },
    select: { cnaeDescription: true },
    orderBy: { updatedAt: "desc" },
  });
  if (fromCatalog?.cnaeDescription?.trim()) {
    return fromCatalog.cnaeDescription.trim();
  }

  return fetchCnaeDescriptionFromIbge(code);
}
