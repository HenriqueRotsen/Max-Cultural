import { NextResponse } from "next/server";
import { tickSyncRun } from "@/lib/sync/run";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Processa a próxima fatia (1 PRONAC). Usado no modo chunked / Vercel. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { syncRunId?: string };
    if (!body.syncRunId) {
      return NextResponse.json({ error: "syncRunId obrigatório" }, { status: 400 });
    }

    const result = await tickSyncRun(body.syncRunId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
