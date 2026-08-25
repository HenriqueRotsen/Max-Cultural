import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHubSession } from "@/lib/hub/auth";
import { resolveContextoForProjetoNome } from "@/lib/hub/resolve-contexto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireHubSession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const nome = new URL(request.url).searchParams.get("nome")?.trim() ?? "";
  if (!nome) {
    return NextResponse.json({ error: "Informe o nome do projeto" }, { status: 400 });
  }

  const resolve = await resolveContextoForProjetoNome(nome);
  return NextResponse.json({ ok: true, resolve });
}
