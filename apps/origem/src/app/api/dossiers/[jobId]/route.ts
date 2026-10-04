import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = Promise<{ jobId: string }>;

export async function GET(_request: Request, context: { params: Params }) {
  try {
    const { entitlements } = await getWorkspaceContext();
    const { jobId } = await context.params;
    const job = await prisma.legalDossierJob.findFirst({
      where: { id: jobId, workspaceId: entitlements.workspaceId },
      include: {
        account: { select: { id: true, name: true, cgccpf: true } },
      },
    });
    if (!job) {
      return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
    }

    const manifest = job.manifestJson as {
      zips?: Array<{
        pronac: string;
        zipPath: string;
        zipStoredBytes: number;
        projectName: string | null;
      }>;
    } | null;

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progressPct: job.progressPct,
      progressMsg: job.progressMsg,
      accountId: job.accountId,
      projectId: job.projectId,
      zipPath: job.zipPath,
      errorMessage: job.errorMessage,
      storagePrefix: job.storagePrefix,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      account: job.account,
      zips: manifest?.zips ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
