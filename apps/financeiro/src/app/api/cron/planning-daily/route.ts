import { NextResponse, after } from "next/server";
import { buildPlanningQueue, runSyncQueue } from "@/lib/sync/queue";

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
 * Cron diário do Planejamento: para cada proponente, busca no SALIC (sessão
 * própria, sem ler a Auditoria) as planilhas homologada/readequada, a situação
 * do projeto e a captação. Uma invocação por proponente.
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const queue = await buildPlanningQueue();
    if (queue.length > 0) {
      const dispatch = () => runSyncQueue(queue, { handOffFirst: true });
      if (process.env.VERCEL) after(dispatch);
      else void dispatch();
    }
    return NextResponse.json({ ok: true, accounts: queue.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
