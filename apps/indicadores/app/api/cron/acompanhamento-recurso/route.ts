import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { garantirAcompanhamento } from "@/lib/acompanhamento/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function assertCronAuth(request: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return bearer === secret;
}

/**
 * Cron diário do acompanhamento: confere o "recurso liberado" de todos os
 * projetos ainda aguardando, no projeto do MAX Financeiro ligado a cada um
 * (PRONAC ou vínculo da gestão). Roda depois do cron do Financeiro, que
 * atualiza a captação pelo SALIC. Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const pendentes = await prisma.projeto.findMany({
    where: { OR: [{ acompanhamento: null }, { acompanhamento: { recursoLiberadoEm: null } }] },
    select: { id: true },
  });
  let liberados = 0;
  for (const p of pendentes) {
    const acomp = await garantirAcompanhamento(p.id);
    if (acomp?.recursoLiberadoEm) liberados += 1;
  }
  return NextResponse.json({ ok: true, verificados: pendentes.length, liberados });
}
