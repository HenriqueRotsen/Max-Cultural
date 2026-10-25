import { NextResponse, after } from "next/server";
import { buildResumeQueue, runSyncQueue } from "@/lib/sync/queue";

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
 * Cron de retomada da Auditoria (algumas vezes depois do sync das 11:00 UTC):
 * continua as contas que ficaram na fila quando alguma etapa estourou o tempo.
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const queue = await buildResumeQueue();
    if (queue.length > 0) {
      const dispatch = () => runSyncQueue(queue, { handOffFirst: true });
      if (process.env.VERCEL) after(dispatch);
      else void dispatch();
    }
    return NextResponse.json({ ok: true, jobs: queue.map((j) => j.kind) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
