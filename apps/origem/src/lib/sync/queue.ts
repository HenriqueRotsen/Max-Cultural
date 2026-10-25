import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import type { SyncOptions } from "@/lib/sync/run";

/**
 * Filas de trabalho com o SALIC, uma etapa por vez (o mesmo usuário SALIC pode
 * atender vários proponentes) e, na Vercel, cada etapa em invocação própria,
 * com o limite de tempo inteiro.
 *
 * - "sync": Auditoria (espelho do SALIC). Não escreve em nenhum outro módulo.
 * - "planning": Planejamento do proponente (planilhas, situação, captação),
 *   pela sessão SALIC do próprio Planejamento — independente da Auditoria.
 */
export type QueueJob =
  | { kind: "sync"; syncRunId: string; options: SyncOptions }
  | { kind: "planning"; workspaceId: string; accountId: string };

export function buildSyncQueue(
  jobs: Array<{ run: { id: string }; options: SyncOptions & { salicAccountId: string; workspaceId: string } }>,
): QueueJob[] {
  return jobs.map(({ run, options }) => ({ kind: "sync", syncRunId: run.id, options }));
}

/** Uma etapa do Planejamento por proponente ativo dos workspaces Pro. */
export async function buildPlanningQueue(): Promise<QueueJob[]> {
  const accounts = await prisma.salicAccount.findMany({
    where: { active: true, workspace: { plan: "PRO" } },
    select: { id: true, workspaceId: true },
    orderBy: { createdAt: "asc" },
  });
  return accounts.map((a) => ({ kind: "planning", workspaceId: a.workspaceId, accountId: a.id }));
}

/** Token das chamadas internas entre etapas (não expõe o segredo bruto). */
export function internalJobToken(): string | null {
  const secret = (process.env.CRON_SECRET || process.env.AUTH_SECRET || "").trim();
  if (!secret) return null;
  return createHash("sha256").update(`origem:sync-jobs:${secret}`).digest("hex");
}

export function isInternalJobRequest(request: Request): boolean {
  const expected = internalJobToken();
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "")
  ).replace(/\/$/, "");
}

/** Entrega o restante da fila a uma nova invocação. false = executar aqui mesmo. */
async function handOff(queue: QueueJob[]): Promise<boolean> {
  const token = internalJobToken();
  const site = siteUrl();
  if (!process.env.VERCEL || !token || !site) return false;
  try {
    const res = await fetch(`${site}/api/cron/sync-run`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ queue }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function runPlanningJob(job: Extract<QueueJob, { kind: "planning" }>) {
  const log = async (m: string) => console.log(`[planejamento ${job.accountId}] ${m}`);
  try {
    const { syncPlanningForWorkspace } = await import("@/lib/planning/federal/daily-sync");
    await syncPlanningForWorkspace(job.workspaceId, job.accountId, log);
    await log("Concluído · planejamento atualizado");
  } catch (error) {
    console.error(`[planejamento ${job.accountId}] falhou:`, error);
  }
}

async function runJob(job: QueueJob) {
  if (job.kind === "sync") {
    const { executeSyncRunSafe } = await import("@/lib/sync/run");
    await executeSyncRunSafe(job.syncRunId, { ...job.options, forceCrawler: true });
  } else {
    await runPlanningJob(job);
  }
}

/** Executa a etapa da vez e passa o resto adiante (ou segue aqui, fora da Vercel). */
export async function runSyncQueue(queue: QueueJob[], { handOffFirst = false } = {}) {
  let rest = queue;
  if (handOffFirst && rest.length > 0 && (await handOff(rest))) return;
  while (rest.length > 0) {
    const [head, ...tail] = rest;
    await runJob(head!);
    rest = tail;
    if (rest.length > 0 && (await handOff(rest))) return;
  }
}

/** Pendentes há mais que isso ficaram órfãs: a fila do dia cabe folgada em 1 h. */
const RESUME_PENDING_AFTER_MS = 60 * 60 * 1000;
/** Não retoma rodadas antigas — a do dia seguinte já cuida da conta. */
const RESUME_PENDING_MAX_AGE_MS = 20 * 60 * 60 * 1000;

/**
 * Retomada da Auditoria: quando uma etapa estoura o tempo, a invocação morre sem
 * repassar o resto da fila. Recoloca as rodadas que ficaram "pending".
 * Vazio = nada a fazer ou ainda há rodada em execução.
 */
export async function buildResumeQueue(): Promise<QueueJob[]> {
  const { closeDeadRunningRuns } = await import("@/lib/sync/run");

  await closeDeadRunningRuns();
  if ((await prisma.syncRun.count({ where: { status: "running" } })) > 0) return [];

  const now = Date.now();
  const pending = await prisma.syncRun.findMany({
    where: {
      status: "pending",
      salicAccount: { active: true },
      createdAt: {
        lt: new Date(now - RESUME_PENDING_AFTER_MS),
        gt: new Date(now - RESUME_PENDING_MAX_AGE_MS),
      },
      // Sync manual de PRONACs específicos não é refeito como conta inteira.
      NOT: { log: { contains: "PRONAC=" } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, salicAccountId: true, salicAccount: { select: { workspaceId: true } } },
  });

  return buildSyncQueue(
    pending.map((run) => ({
      run: { id: run.id },
      options: {
        salicAccountId: run.salicAccountId!,
        workspaceId: run.salicAccount!.workspaceId,
        forceCrawler: true,
      },
    })),
  );
}
