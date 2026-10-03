import { NextResponse, after } from "next/server";
import { enqueueAccountSyncs } from "@/lib/sync/run";
import { buildSyncQueue, runSyncQueue } from "@/lib/sync/queue";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { getWorkspaceContext } = await import("@/lib/auth/session");
    const { assertAccountInWorkspace, assertCanSync } = await import("@/lib/auth/workspace");
    const { entitlements } = await getWorkspaceContext();
    await assertCanSync(entitlements);

    const body = (await request.json().catch(() => ({}))) as {
      accountId?: string;
      pronacs?: string[];
    };

    if (body.accountId) {
      await assertAccountInWorkspace(body.accountId, entitlements.workspaceId);
    }

    const jobs = await enqueueAccountSyncs({
      salicAccountId: body.accountId || undefined,
      forceCrawler: true,
      pronacs: body.pronacs,
      workspaceId: entitlements.workspaceId,
    });

    // Em serverless o `after` mantém o trabalho vivo pós-resposta.
    const dispatch = () => runSyncQueue(buildSyncQueue(jobs), { handOffFirst: true });
    if (process.env.VERCEL) after(dispatch);
    else void dispatch();

    const first = jobs[0]!.run;
    const runWithAccount = await prisma.syncRun.findUnique({
      where: { id: first.id },
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    });

    return NextResponse.json({
      syncRunId: first.id,
      syncRunIds: jobs.map((j) => j.run.id),
      status: first.status,
      run: runWithAccount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
