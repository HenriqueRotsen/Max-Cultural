import { cache } from "react";
import { notFound } from "next/navigation";
import { getHubPermissions } from "@/lib/auth/hub-permissions";
import { isHidingOverLimit } from "@/lib/compliance/over-limit-permission";
import { getWorkspaceContext } from "@/lib/auth/session";
import { getPronacPanorama } from "@/lib/audit";
import { loadComplianceBundle, metaForAccount } from "@/lib/compliance/context";
import { worstComplianceTone } from "@/lib/compliance/rouanet";

export { HIDE_OVER_LIMIT_PERMISSION, isHidingOverLimit } from "@/lib/compliance/over-limit-permission";

export type OverLimitScope = {
  /** Projetos (ids) que a pessoa não pode ver. Vazio = vê tudo. */
  projectIds: string[];
  /** PRONACs desses projetos (para alertas, que guardam o PRONAC). */
  pronacs: string[];
};

const EMPTY: OverLimitScope = { projectIds: [], pronacs: [] };

const TTL_MS = 60_000;
const memo = new Map<string, { at: number; value: Promise<OverLimitScope> }>();

/** Projetos acima do limite no workspace, no período inteiro — mesma regra da linha vermelha. */
export function computeOverLimitProjects(workspaceId: string): Promise<OverLimitScope> {
  // Roda em toda navegação de quem tem a restrição (o menu conta alertas): guarda por 1 min.
  const hit = memo.get(workspaceId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = computeNow(workspaceId);
  memo.set(workspaceId, { at: Date.now(), value });
  value.catch(() => memo.delete(workspaceId));
  return value;
}

async function computeNow(workspaceId: string): Promise<OverLimitScope> {
  const rows = await getPronacPanorama({ workspaceId });
  if (rows.length === 0) return EMPTY;
  const bundle = await loadComplianceBundle([...new Set(rows.map((r) => r.accountId))], {
    workspaceId,
  });
  const projectIds: string[] = [];
  const pronacs = new Set<string>();
  for (const row of rows) {
    const meta = metaForAccount(bundle, row.accountId, row.rules.version);
    const tone = worstComplianceTone(row.allBySupplier, row.projectTotal, row.accountCgccpf, {
      personType: meta.personType || row.personType,
      relatedParties: meta.relatedParties,
      rules: row.rules,
      bondSuppliers: row.bondBySupplier.length ? row.bondBySupplier : row.allBySupplier,
    });
    if (tone === "critical") {
      projectIds.push(row.projectId);
      pronacs.add(row.pronac);
    }
  }
  return { projectIds, pronacs: [...pronacs] };
}

/**
 * O que a pessoa logada não pode ver. Para quem não tem a restrição, devolve vazio
 * sem consultar nada. Uma vez por requisição.
 */
export const getOverLimitScope = cache(async (): Promise<OverLimitScope> => {
  const perms = await getHubPermissions();
  if (!isHidingOverLimit(perms)) return EMPTY;
  const { entitlements } = await getWorkspaceContext();
  return computeOverLimitProjects(entitlements.workspaceId);
});

/** Ids para `PanoramaFilters.hiddenProjectIds`. */
export async function hiddenProjectIds(): Promise<string[]> {
  return (await getOverLimitScope()).projectIds;
}

/** Filtro Prisma de projeto: `{ id: { notIn } }` ou nada. */
export function excludeProjects(ids: string[]) {
  return ids.length ? { id: { notIn: ids } } : {};
}

/** Filtro Prisma de alerta: `{ pronac: { notIn } }` ou nada. */
export function excludeAlertPronacs(pronacs: string[]) {
  return pronacs.length ? { pronac: { notIn: pronacs } } : {};
}

export async function isHiddenPronac(pronac: string): Promise<boolean> {
  return (await getOverLimitScope()).pronacs.includes(pronac);
}

/** Link direto para um PRONAC escondido → “não encontrado”. */
export async function notFoundIfHiddenPronac(pronac: string) {
  if (await isHiddenPronac(pronac)) notFound();
}
