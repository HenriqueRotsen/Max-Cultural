import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";

export type BondedParty = {
  cgccpf: string;
  name: string;
  enabled: boolean;
};

/** Docs com vínculo ligado neste PRONAC. */
export async function loadEnabledBondDocs(projectId: string): Promise<Set<string>> {
  if (!projectId) return new Set();
  const rows = await prisma.projectObservadoBond.findMany({
    where: { projectId, enabled: true },
    select: { cgccpf: true },
  });
  return new Set(rows.map((r) => normalizeCgccpf(r.cgccpf)).filter(Boolean));
}

/** Docs com vínculo ligado, por PRONAC (projectId → docs). */
export async function loadEnabledBondDocsForProjects(
  projectIds: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!projectIds.length) return map;
  const rows = await prisma.projectObservadoBond.findMany({
    where: { projectId: { in: projectIds }, enabled: true },
    select: { projectId: true, cgccpf: true },
  });
  for (const r of rows) {
    const dig = normalizeCgccpf(r.cgccpf);
    if (!dig) continue;
    const set = map.get(r.projectId) || new Set<string>();
    set.add(dig);
    map.set(r.projectId, set);
  }
  return map;
}

/** Partes para a soma do vínculo: docs ligados + nomes dos observados/fornecedores quando houver. */
export function bondedPartiesFromDocs(
  docs: Set<string>,
  nameByDoc?: Map<string, string>,
): Array<{ cgccpf: string; name: string; countsTowardProponentCap: true }> {
  return Array.from(docs).map((cgccpf) => ({
    cgccpf,
    name: nameByDoc?.get(cgccpf) || cgccpf,
    countsTowardProponentCap: true as const,
  }));
}
