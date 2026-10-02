import { createHash } from "crypto";
import { prisma } from "@/lib/db";

/** Token da chamada interna sync → etapa de planejamento (não expõe o segredo bruto). */
export function planningPhaseToken(): string | null {
  const secret = (process.env.CRON_SECRET || process.env.AUTH_SECRET || "").trim();
  if (!secret) return null;
  return createHash("sha256").update(`origem:planning-phase:${secret}`).digest("hex");
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

/** Planejamento + Fluxo para os workspaces sincronizados; registra no histórico do sync. */
export async function runPlanningPhase(syncRunId: string, workspaceIds: string[]) {
  const { syncPlanningForWorkspace } = await import("@/lib/planning/federal/daily-sync");
  const log = (m: string) => appendRunLog(syncRunId, m).catch(() => undefined);
  for (const workspaceId of workspaceIds) {
    try {
      await syncPlanningForWorkspace(workspaceId, log);
    } catch (error) {
      await log(
        `Planejamento: falhou (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
  await log("Concluído · planejamento atualizado");
}

/**
 * Na Vercel a etapa roda em outra invocação (limite de tempo próprio);
 * localmente roda em sequência.
 */
export async function startPlanningPhase(syncRunId: string, workspaceIds: string[]) {
  if (workspaceIds.length === 0) return;
  const token = planningPhaseToken();
  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "")
  ).replace(/\/$/, "");

  if (process.env.VERCEL && token && site) {
    try {
      const res = await fetch(`${site}/api/cron/sync-planning`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ syncRunId, workspaceIds }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        await appendRunLog(syncRunId, "Atualizando planejamento e contextos do Fluxo…");
        return;
      }
    } catch {
      // cai para execução na mesma invocação
    }
  }
  await runPlanningPhase(syncRunId, workspaceIds);
}
