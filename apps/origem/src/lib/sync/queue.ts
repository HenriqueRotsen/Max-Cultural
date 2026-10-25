import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Fila do Planejamento com o SALIC: uma etapa por proponente (planilhas,
 * situação, captação), pela sessão SALIC do próprio Planejamento. Uma etapa por
 * vez (o mesmo usuário SALIC pode atender vários proponentes) e, na Vercel, cada
 * etapa em invocação própria, com o limite de tempo inteiro.
 * O sync da Auditoria (espelho do SALIC) roda no app MAX Auditoria.
 */
export type QueueJob = { kind: "planning"; workspaceId: string; accountId: string };

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

/** Executa a etapa da vez e passa o resto adiante (ou segue aqui, fora da Vercel). */
export async function runSyncQueue(queue: QueueJob[], { handOffFirst = false } = {}) {
  let rest = queue;
  if (handOffFirst && rest.length > 0 && (await handOff(rest))) return;
  while (rest.length > 0) {
    const [head, ...tail] = rest;
    await runPlanningJob(head!);
    rest = tail;
    if (rest.length > 0 && (await handOff(rest))) return;
  }
}
