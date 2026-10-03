import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import type { SyncOptions } from "@/lib/sync/run";

/**
 * Fila do sync SALIC: auditoria de cada proponente → planejamento/Fluxo daquele
 * proponente → (no fim) espelho do catálogo. Uma etapa por vez (o mesmo usuário
 * SALIC pode atender vários proponentes) e, na Vercel, cada etapa em invocação
 * própria, com o limite de tempo inteiro.
 */
export type QueueJob =
  | { kind: "sync"; syncRunId: string; options: SyncOptions }
  | { kind: "planning"; syncRunId: string; workspaceId: string; accountId: string }
  | { kind: "catalog"; workspaceId: string };

export function buildSyncQueue(
  jobs: Array<{ run: { id: string }; options: SyncOptions & { salicAccountId: string; workspaceId: string } }>,
): QueueJob[] {
  const queue: QueueJob[] = [];
  for (const { run, options } of jobs) {
    queue.push({ kind: "sync", syncRunId: run.id, options });
    queue.push({
      kind: "planning",
      syncRunId: run.id,
      workspaceId: options.workspaceId,
      accountId: options.salicAccountId,
    });
  }
  for (const workspaceId of new Set(jobs.map((j) => j.options.workspaceId))) {
    queue.push({ kind: "catalog", workspaceId });
  }
  return queue;
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

async function runPlanningJob(job: Extract<QueueJob, { kind: "planning" }>) {
  const run = await prisma.syncRun.findUnique({
    where: { id: job.syncRunId },
    select: { status: true },
  });
  if (run?.status !== "success" && run?.status !== "partial") return;

  const log = (m: string) => appendRunLog(job.syncRunId, m).catch(() => undefined);
  await log("Atualizando planejamento e contextos do Fluxo…");
  try {
    const { syncPlanningForWorkspace } = await import("@/lib/planning/federal/daily-sync");
    await syncPlanningForWorkspace(job.workspaceId, job.accountId, log);
    await log("Concluído · planejamento atualizado");
  } catch (error) {
    await log(`Planejamento: falhou (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function runJob(job: QueueJob) {
  if (job.kind === "sync") {
    const { executeSyncRunSafe } = await import("@/lib/sync/run");
    await executeSyncRunSafe(job.syncRunId, { ...job.options, forceCrawler: true });
  } else if (job.kind === "planning") {
    await runPlanningJob(job);
  } else {
    // Incremental: se o tempo acabar, a próxima rodada continua de onde parou.
    const { ensureCatalogFromAudit } = await import("@/lib/catalog/from-audit");
    await ensureCatalogFromAudit(job.workspaceId);
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
