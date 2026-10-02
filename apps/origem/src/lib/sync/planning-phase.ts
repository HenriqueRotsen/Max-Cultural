import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import type { SyncOptions } from "@/lib/sync/run";

export type PlanningTarget = { workspaceId: string; accountId: string };

/** Token das chamadas internas entre etapas do sync (não expõe o segredo bruto). */
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

/** Na Vercel, cada etapa ganha uma invocação própria (limite de tempo próprio). */
async function postInternalJob(path: string, body: unknown): Promise<boolean> {
  const token = internalJobToken();
  const site = siteUrl();
  if (!process.env.VERCEL || !token || !site) return false;
  try {
    const res = await fetch(`${site}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function appendRunLog(syncRunId: string, message: string) {
  const run = await prisma.syncRun.findUnique({
    where: { id: syncRunId },
    select: { log: true },
  });
  if (!run) return;
  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: {
      log: [run.log, message].filter(Boolean).join("\n"),
      progressMessage: message,
    },
  });
}

/** Planejamento + Fluxo para as contas sincronizadas; registra no histórico do sync. */
export async function runPlanningPhase(syncRunId: string, targets: PlanningTarget[]) {
  const { syncPlanningForWorkspace } = await import("@/lib/planning/federal/daily-sync");
  const log = (m: string) => appendRunLog(syncRunId, m).catch(() => undefined);
  for (const { workspaceId, accountId } of targets) {
    try {
      await syncPlanningForWorkspace(workspaceId, accountId, log);
    } catch (error) {
      await log(
        `Planejamento: falhou (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
  await log("Concluído · planejamento atualizado");
}

export async function startPlanningPhase(syncRunId: string, targets: PlanningTarget[]) {
  if (targets.length === 0) return;
  if (await postInternalJob("/api/cron/sync-planning", { syncRunId, targets })) {
    await appendRunLog(syncRunId, "Atualizando planejamento e contextos do Fluxo…");
    return;
  }
  await runPlanningPhase(syncRunId, targets);
}

export type SyncJob = { syncRunId: string; options: SyncOptions };

/**
 * Executa as contas em fila, uma de cada vez (o mesmo usuário SALIC pode atender
 * vários proponentes e logins simultâneos derrubam a sessão). Na Vercel cada conta
 * roda em invocação própria e, ao terminar, dispara a próxima.
 */
export async function runSyncQueue(
  queue: SyncJob[],
  execute: (job: SyncJob) => Promise<void>,
) {
  let rest = queue;
  while (rest.length > 0) {
    const [head, ...tail] = rest;
    if (await postInternalJob("/api/cron/sync-run", { job: head, queue: tail })) return;
    await execute(head!);
    rest = tail;
  }
}
