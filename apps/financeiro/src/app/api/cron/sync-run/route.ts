import { NextResponse, after } from "next/server";
import { isInternalJobRequest, runSyncQueue, type QueueJob } from "@/lib/sync/queue";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Próxima etapa da fila do sync SALIC (chamada interna). */
export async function POST(request: Request) {
  if (!isInternalJobRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { queue?: QueueJob[] };
  const queue = Array.isArray(body.queue) ? body.queue : [];
  if (queue.length === 0) {
    return NextResponse.json({ error: "fila vazia" }, { status: 400 });
  }
  after(() => runSyncQueue(queue));
  return NextResponse.json({ ok: true }, { status: 202 });
}
