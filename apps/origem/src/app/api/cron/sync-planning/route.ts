import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "crypto";
import { planningPhaseToken, runPlanningPhase } from "@/lib/sync/planning-phase";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = planningPhaseToken();
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Etapa de planejamento do sync SALIC (chamada interna ao fim da auditoria). */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    syncRunId?: string;
    workspaceIds?: string[];
  };
  const workspaceIds = (body.workspaceIds || []).filter((id) => typeof id === "string" && id);
  if (!body.syncRunId || workspaceIds.length === 0) {
    return NextResponse.json({ error: "syncRunId e workspaceIds obrigatórios" }, { status: 400 });
  }
  const syncRunId = body.syncRunId;
  after(() => runPlanningPhase(syncRunId, workspaceIds));
  return NextResponse.json({ ok: true }, { status: 202 });
}
