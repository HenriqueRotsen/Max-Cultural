import { prisma } from "@/lib/db";
import { refreshProjectSponsors } from "@/lib/salic/persist";

/** Diferença (R$) entre captado e soma dos patrocinadores que ainda conta como "falta dinheiro". */
const GAP_TOLERANCE = 1;
/** Mesmo sem falta de dinheiro, revisa a lista depois disso. */
const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
/** Com dinheiro faltando, não busca de novo antes disso (a API pode simplesmente não ter o resto). */
const GAP_RETRY_MS = 20 * 60 * 60 * 1000;

export type SponsorSyncState = {
  sponsorsSyncedAt: Date | null;
  valorCaptado: number | null;
  sponsorTotal: number;
};

/**
 * Precisa buscar os patrocinadores deste projeto? Só o que pode ter mudado:
 * nunca buscado; captado maior que a soma dos patrocinadores (entrou dinheiro
 * novo) e última busca há mais de 20 h; ou última busca há mais de 30 dias.
 */
export function needsSponsorRefresh(p: SponsorSyncState, now = new Date()): boolean {
  if (!p.sponsorsSyncedAt) return true;
  const age = now.getTime() - p.sponsorsSyncedAt.getTime();
  if (age > RECHECK_MS) return true;
  const gap = (p.valorCaptado ?? 0) - p.sponsorTotal;
  return gap > GAP_TOLERANCE && age > GAP_RETRY_MS;
}

/** Estado de patrocinadores de cada projeto (opcionalmente de um workspace). */
export async function loadSponsorSyncStates(workspaceId?: string) {
  const projects = await prisma.project.findMany({
    where: workspaceId ? { salicAccount: { workspaceId } } : {},
    select: { id: true, pronac: true, valorCaptado: true, sponsorsSyncedAt: true },
  });
  const sums = await prisma.projectSponsorship.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projects.map((p) => p.id) } },
    _sum: { amount: true },
  });
  const sumBy = new Map(sums.map((s) => [s.projectId, Number(s._sum.amount || 0)]));
  return projects.map((p) => ({
    id: p.id,
    pronac: p.pronac,
    sponsorsSyncedAt: p.sponsorsSyncedAt,
    valorCaptado: p.valorCaptado != null ? Number(p.valorCaptado) : null,
    sponsorTotal: sumBy.get(p.id) ?? 0,
  }));
}

/** Busca o projeto só se precisar (usado pela atualização do SALIC). */
export async function refreshProjectSponsorsIfNeeded(params: {
  projectId: string;
  pronac: string;
  apiOptions?: { timeoutMs?: number; maxAttempts?: number };
}): Promise<number | "em-dia" | null> {
  const p = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { valorCaptado: true, sponsorsSyncedAt: true },
  });
  if (!p) return null;
  const sum = await prisma.projectSponsorship.aggregate({
    where: { projectId: params.projectId },
    _sum: { amount: true },
  });
  const state = {
    sponsorsSyncedAt: p.sponsorsSyncedAt,
    valorCaptado: p.valorCaptado != null ? Number(p.valorCaptado) : null,
    sponsorTotal: Number(sum._sum.amount || 0),
  };
  if (!needsSponsorRefresh(state)) return "em-dia";
  return refreshProjectSponsors(params);
}

export type SponsorSyncResult = {
  /** Projetos que precisavam de busca. */
  pending: number;
  updated: number;
  failed: number;
  /** Ficaram para a próxima (tempo esgotado ou API fora). */
  remaining: number;
  apiDown: boolean;
};

/**
 * Busca, na API pública do SALIC, os patrocinadores dos projetos que precisam
 * (ver `needsSponsorRefresh`), nunca buscados primeiro. Para no tempo dado ou
 * depois de 3 falhas seguidas (API fora do ar).
 */
export async function syncPendingSponsors(params: {
  workspaceId?: string;
  budgetMs?: number;
  concurrency?: number;
}): Promise<SponsorSyncResult> {
  const budgetMs = params.budgetMs ?? 240_000;
  const started = Date.now();
  const states = await loadSponsorSyncStates(params.workspaceId);
  // Um PRONAC pode estar em mais de uma conta: busca cada projeto, mas na ordem
  // nunca buscados → maior falta de dinheiro.
  const queue = states
    .filter((s) => needsSponsorRefresh(s))
    .sort((a, b) => {
      if (!a.sponsorsSyncedAt !== !b.sponsorsSyncedAt) return a.sponsorsSyncedAt ? 1 : -1;
      const ga = (a.valorCaptado ?? 0) - a.sponsorTotal;
      const gb = (b.valorCaptado ?? 0) - b.sponsorTotal;
      return gb - ga;
    });

  let updated = 0;
  let failed = 0;
  let failStreak = 0;
  let next = 0;
  let apiDown = false;

  const worker = async () => {
    while (next < queue.length) {
      if (apiDown || Date.now() - started > budgetMs) return;
      const item = queue[next++]!;
      const n = await refreshProjectSponsors({
        projectId: item.id,
        pronac: item.pronac,
        apiOptions: { timeoutMs: 20_000, maxAttempts: 2 },
      }).catch(() => null);
      if (n == null) {
        failed++;
        failStreak++;
        if (failStreak >= 3) apiDown = true;
      } else {
        updated++;
        failStreak = 0;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, params.concurrency ?? 4) }, worker));

  return {
    pending: queue.length,
    updated,
    failed,
    remaining: queue.length - updated,
    apiDown,
  };
}
