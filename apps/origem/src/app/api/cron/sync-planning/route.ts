import { NextResponse, after } from "next/server";
import {
  isInternalJobRequest,
  runPlanningPhase,
  type PlanningTarget,
} from "@/lib/sync/planning-phase";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Etapa de planejamento do sync SALIC (chamada interna ao fim da auditoria). */
export async function POST(request: Request) {
  if (!isInternalJobRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    syncRunId?: string;
    targets?: PlanningTarget[];
  };
  const targets = (body.targets || []).filter((t) => t?.workspaceId && t?.accountId);
  if (!body.syncRunId || targets.length === 0) {
    return NextResponse.json({ error: "syncRunId e targets obrigatórios" }, { status: 400 });
  }
  const syncRunId = body.syncRunId;
  after(() => runPlanningPhase(syncRunId, targets));
  return NextResponse.json({ ok: true }, { status: 202 });
}
