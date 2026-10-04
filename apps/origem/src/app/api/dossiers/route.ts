import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Lista jobs recentes do workspace (opcionalmente filtrados por accountId). */
export async function GET(request: Request) {
  try {
    const { entitlements } = await getWorkspaceContext();
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId") || undefined;

    if (accountId) {
      const account = await prisma.salicAccount.findFirst({
        where: { id: accountId, workspaceId: entitlements.workspaceId },
        select: { id: true },
      });
      if (!account) {
        return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
      }
    }

    const jobs = await prisma.legalDossierJob.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        ...(accountId ? { accountId } : {}),
        status: { not: "replaced" },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        accountId: true,
        projectId: true,
        status: true,
        progressPct: true,
        progressMsg: true,
        zipPath: true,
        errorMessage: true,
        createdAt: true,
        finishedAt: true,
        manifestJson: true,
      },
    });

    return NextResponse.json({
      jobs: jobs.map((j) => {
        const manifest = j.manifestJson as {
          zips?: Array<{ pronac: string; zipPath: string; zipStoredBytes: number }>;
        } | null;
        return {
          id: j.id,
          accountId: j.accountId,
          projectId: j.projectId,
          status: j.status,
          progressPct: j.progressPct,
          progressMsg: j.progressMsg,
          zipPath: j.zipPath,
          errorMessage: j.errorMessage,
          createdAt: j.createdAt.toISOString(),
          finishedAt: j.finishedAt?.toISOString() ?? null,
          zips: manifest?.zips ?? [],
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
