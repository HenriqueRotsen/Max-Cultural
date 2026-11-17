import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";

/**
 * Fornecedor agência (intermediária), marcado no Financeiro ou aqui: só `pct`%
 * do que foi pago a ele conta nos limites de fornecedor e de vínculo.
 * Mapa por espaço de trabalho → CNPJ (só dígitos) → percentual.
 */
export type AgencyMaps = Map<string, Map<string, number>>;

export async function loadAgencyMaps(workspaceIds: Iterable<string>): Promise<AgencyMaps> {
  const ids = Array.from(new Set(workspaceIds)).filter(Boolean);
  const out: AgencyMaps = new Map();
  if (ids.length === 0) return out;
  const rows = await prisma.supplierAgency.findMany({
    where: { workspaceId: { in: ids } },
    select: { workspaceId: true, cnpj: true, pct: true },
  });
  for (const r of rows) {
    const m = out.get(r.workspaceId) ?? new Map<string, number>();
    m.set(r.cnpj, Number(r.pct));
    out.set(r.workspaceId, m);
  }
  return out;
}

export function agencyPctOf(
  maps: AgencyMaps,
  workspaceId: string | null | undefined,
  cgccpf: string,
): number | null {
  if (!workspaceId) return null;
  return maps.get(workspaceId)?.get(normalizeCgccpf(cgccpf)) ?? null;
}

/** Acrescenta `capTotal` (pago × %) e `agencyPct` em cada fornecedor agência. */
export function withAgency<T extends { cgccpf: string; total: number }>(
  list: T[],
  maps: AgencyMaps,
  workspaceId: string | null | undefined,
): Array<T & { capTotal: number; agencyPct: number | null }> {
  return list.map((s) => {
    const pct = agencyPctOf(maps, workspaceId, s.cgccpf);
    return {
      ...s,
      agencyPct: pct,
      capTotal: pct == null ? s.total : (s.total * Math.min(100, Math.max(0, pct))) / 100,
    };
  });
}

export const fmtAgencyPct = (pct: number) =>
  `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
