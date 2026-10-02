import { NextResponse, after } from "next/server";
import { isInternalJobRequest, runSyncQueue, type SyncJob } from "@/lib/sync/planning-phase";
import { executeSyncRunSafe } from "@/lib/sync/run";

export const runtime = "nodejs";
export const maxDuration = 300;

const runJob = (job: SyncJob) =>
  executeSyncRunSafe(job.syncRunId, { ...job.options, forceCrawler: true });

/** Sync de um proponente (chamada interna); ao terminar, encaminha o restante da fila. */
export async function POST(request: Request) {
  if (!isInternalJobRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { job?: SyncJob; queue?: SyncJob[] };
  const job = body.job;
  if (!job?.syncRunId || !job.options?.salicAccountId) {
    return NextResponse.json({ error: "job inválido" }, { status: 400 });
  }
  const queue = (body.queue || []).filter((j) => j?.syncRunId && j.options?.salicAccountId);
  after(async () => {
    await runJob(job);
    await runSyncQueue(queue, runJob);
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
