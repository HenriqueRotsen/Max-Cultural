import { NextResponse } from "next/server";
import { syncPendingSponsors } from "@/lib/salic/sponsors-sync";

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
 * Cron diário de patrocinadores (depois das retomadas do SALIC): busca na API
 * pública só os projetos que precisam — nunca buscados ou com dinheiro novo.
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncPendingSponsors({ budgetMs: 270_000 });
    console.log("[patrocinadores] rotina diária", JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[patrocinadores] rotina diária falhou", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
