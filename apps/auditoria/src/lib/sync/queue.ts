import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import type { SyncOptions } from "@/lib/sync/run";

/**
 * Fila do sync da Auditoria (espelho do SALIC), uma conta por vez (o mesmo
 * usuário SALIC pode atender vários proponentes) e, na Vercel, cada conta em
 * invocação própria, com o limite de tempo inteiro.
 */
export type QueueJob = { kind: "sync"; syncRunId: string; options: SyncOptions };

export function buildSyncQueue(
  jobs: Array<{ run: { id: string }; options: SyncOptions & { salicAccountId: string; workspaceId: string } }>,
): QueueJob[] {
  return jobs.map(({ run, options }) => ({ kind: "sync", syncRunId: run.id, options }));
}

/** Token das chamadas internas entre etapas (não expõe o segredo bruto). */
export function internalJobToken(): string | null {
  const secret = (process.env.CRON_SECRET || process.env.AUTH_SECRET || "").trim();
  if (!secret) return null;
  return createHash("sha256").update(`auditoria:sync-jobs:${secret}`).digest("hex");
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

async function runJob(job: QueueJob) {
  const { executeSyncRunSafe } = await import("@/lib/sync/run");
  await executeSyncRunSafe(job.syncRunId, { ...job.options, forceCrawler: true });
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
      // Retomada automática respeita a atualização desligada no workspace.
      salicAccount: { active: true, workspace: { salicAutoSync: true } },
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
