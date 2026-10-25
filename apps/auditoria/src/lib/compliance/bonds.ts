import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";

export type BondedParty = {
  cgccpf: string;
  name: string;
  enabled: boolean;
  rulesetVersion: string;
};

/** Docs com vínculo ligado para conta + IN. */
export async function loadEnabledBondDocs(
  salicAccountId: string,
  rulesetVersion: string,
): Promise<Set<string>> {
  if (!salicAccountId || !rulesetVersion) return new Set();
  const rows = await prisma.observadoBond.findMany({
    where: {
      salicAccountId,
      rulesetVersion,
      enabled: true,
    },
    select: { cgccpf: true },
  });
  return new Set(rows.map((r) => normalizeCgccpf(r.cgccpf)).filter(Boolean));
}

/** Todos os bonds de um conjunto de contas (qualquer IN). */
export async function loadObservadoBondsForAccounts(
  accountIds: string[],
): Promise<
  Map<string, Array<{ cgccpf: string; rulesetVersion: string; enabled: boolean }>>
> {
  const map = new Map<
    string,
    Array<{ cgccpf: string; rulesetVersion: string; enabled: boolean }>
  >();
  if (!accountIds.length) return map;

  const rows = await prisma.observadoBond.findMany({
    where: { salicAccountId: { in: accountIds } },
    select: {
      salicAccountId: true,
      cgccpf: true,
      rulesetVersion: true,
      enabled: true,
    },
  });

  for (const r of rows) {
    const dig = normalizeCgccpf(r.cgccpf);
    if (!dig) continue;
    const list = map.get(r.salicAccountId) || [];
    list.push({
      cgccpf: dig,
      rulesetVersion: r.rulesetVersion,
      enabled: r.enabled,
    });
    map.set(r.salicAccountId, list);
  }
  return map;
}

export function enabledDocsForRuleset(
  bonds:
    | Array<{ cgccpf: string; rulesetVersion: string; enabled: boolean }>
    | undefined,
  rulesetVersion: string | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!bonds?.length || !rulesetVersion) return out;
  for (const b of bonds) {
    if (b.enabled && b.rulesetVersion === rulesetVersion) {
      out.add(normalizeCgccpf(b.cgccpf));
    }
  }
  return out;
}

/** Partes para soma art. 23: docs ligados + nomes dos observados/fornecedores quando houver. */
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
