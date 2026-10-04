import { NextResponse, after } from "next/server";
import { isDossierInternalRequest, runDossierJob } from "@/lib/dossier/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Continuação do dossiê (handOff entre PRONACs — chamada interna). */
export async function POST(request: Request) {
  if (!isDossierInternalRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { jobId?: string };
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) {
    return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });
  }
  after(() => runDossierJob(jobId));
  return NextResponse.json({ ok: true }, { status: 202 });
}
