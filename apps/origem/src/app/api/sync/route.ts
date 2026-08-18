import { NextResponse } from "next/server";
import { after } from "next/server";
import { enqueueSync, executeSyncRun } from "@/lib/sync/run";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { isDemoMode } = await import("@/lib/auth/config");
    if (isDemoMode()) {
      return NextResponse.json(
        { error: "Sincronização não está disponível no modo demonstração." },
        { status: 403 },
      );
    }

    const { getWorkspaceContext } = await import("@/lib/auth/session");
    const { assertAccountInWorkspace, assertCanSync } = await import("@/lib/auth/workspace");
    const { entitlements } = await getWorkspaceContext();
    await assertCanSync(entitlements);

    const body = (await request.json().catch(() => ({}))) as {
      accountId?: string;
      forceCrawler?: boolean;
      pronacs?: string[];
    };

    if (body.accountId) {
      await assertAccountInWorkspace(body.accountId, entitlements.workspaceId);
    }

    const options = {
      salicAccountId: body.accountId || undefined,
      forceCrawler: Boolean(body.forceCrawler),
      pronacs: body.pronacs,
      workspaceId: entitlements.workspaceId,
    };

    const syncRun = await enqueueSync(options);

    const runWithAccount = await prisma.syncRun.findUnique({
      where: { id: syncRun.id },
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    });

    const runJob = () =>
      void executeSyncRun(syncRun.id, options).catch(async (error) => {
        if (error instanceof Error && error.name === "SyncCancelledError") return;
        const current = await prisma.syncRun.findUnique({
          where: { id: syncRun.id },
          select: { progressMessage: true, errorMessage: true, status: true },
        });
        if (
          current?.progressMessage === "Cancelada" ||
          current?.errorMessage === "Cancelada pelo usuário"
        ) {
          return;
        }
        if (current?.status !== "pending" && current?.status !== "running") {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        await prisma.syncRun.update({
          where: { id: syncRun.id },
          data: {
            status: "error",
            finishedAt: new Date(),
            errorMessage: message,
            progressMessage: "Falhou",
          },
        });
      });

    // Em serverless o `after` mantém o trabalho vivo pós-resposta.
    // Em local/`ngrok`, disparar na hora evita sync "travado" em pending.
    if (process.env.VERCEL) {
      after(runJob);
    } else {
      runJob();
    }

    return NextResponse.json({
      syncRunId: syncRun.id,
      status: syncRun.status,
      run: runWithAccount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
