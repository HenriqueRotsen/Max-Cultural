import { NextResponse, after } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { runDossierJob } from "@/lib/dossier/run";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Params = Promise<{ jobId: string }>;

/**
 * Continua a próxima fatia (1 PRONAC) de um job running/pending.
 * Usado pela UI quando o handOff interno falha ou a invocação anterior morreu.
 */
export async function POST(_request: Request, context: { params: Params }) {
  try {
    const { entitlements } = await getWorkspaceContext();
    const { jobId } = await context.params;
    const job = await prisma.legalDossierJob.findFirst({
      where: { id: jobId, workspaceId: entitlements.workspaceId },
      select: { id: true, status: true, workState: true, progressPct: true, progressMsg: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
    }
    if (job.status !== "pending" && job.status !== "running") {
      return NextResponse.json({ ok: true, status: job.status, skipped: true });
    }

    // Libera lease expirado antes de retomar (evita “parado” eterno).
    const ws = job.workState as { lockUntil?: string; projectIds?: string[]; cursor?: number } | null;
    if (ws?.lockUntil) {
      const lockMs = Date.parse(ws.lockUntil);
      if (!Number.isFinite(lockMs) || lockMs <= Date.now()) {
        const { lockUntil: _drop, ...rest } = ws;
        await prisma.legalDossierJob.update({
          where: { id: job.id },
          data: {
            workState: rest,
            progressMsg: job.progressMsg?.includes("Gerando")
              ? "Aguardando continuação…"
              : job.progressMsg,
          },
        });
      }
    }

    after(() => runDossierJob(job.id));
    return NextResponse.json({ ok: true, status: 202 }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
