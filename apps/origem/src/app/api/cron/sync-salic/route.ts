import { NextResponse } from "next/server";
import { after } from "next/server";
import { enqueueSync, executeSyncRun, SyncCancelledError } from "@/lib/sync/run";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

function assertCronAuth(request: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  return bearer === secret;
}

/**
 * Cron diário (08:00 BRT = 11:00 UTC): sincroniza contas Pro com o SALIC.
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const options = { forceCrawler: true as const };
    const syncRun = await enqueueSync(options);

    const runJob = () =>
      void executeSyncRun(syncRun.id, options).catch(async (error) => {
        if (error instanceof SyncCancelledError) return;
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

    if (process.env.VERCEL) {
      after(runJob);
    } else {
      runJob();
    }

    return NextResponse.json({
      ok: true,
      syncRunId: syncRun.id,
      status: syncRun.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
