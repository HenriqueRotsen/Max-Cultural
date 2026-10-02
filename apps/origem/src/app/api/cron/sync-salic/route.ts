import { NextResponse, after } from "next/server";
import { enqueueAccountSyncs } from "@/lib/sync/run";
import { buildSyncQueue, runSyncQueue } from "@/lib/sync/queue";

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
 * Cron diário (08:00 BRT = 11:00 UTC): sincroniza os proponentes Pro com o SALIC
 * (uma invocação por conta) e, ao fim de cada uma, atualiza planejamento e Fluxo.
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const jobs = await enqueueAccountSyncs({ forceCrawler: true });
    const dispatch = () => runSyncQueue(buildSyncQueue(jobs), { handOffFirst: true });
    if (process.env.VERCEL) after(dispatch);
    else void dispatch();

    return NextResponse.json({ ok: true, syncRunIds: jobs.map((j) => j.run.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
