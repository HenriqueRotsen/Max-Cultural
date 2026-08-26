import { NextResponse } from "next/server";
import {
  hubAuthErrorResponse,
  requireHubAnyPermission,
} from "@/lib/hub/auth";
import { resolveContextoForProjetoNome } from "@/lib/hub/resolve-contexto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireHubAnyPermission(request, [
    "contextos:read",
    "import:write",
    "contextos:create",
  ]);
  if (!auth.ok) {
    const { message, status } = hubAuthErrorResponse(auth);
    return NextResponse.json({ error: message }, { status });
  }

  const nome = new URL(request.url).searchParams.get("nome")?.trim() ?? "";
  if (!nome) {
    return NextResponse.json({ error: "Informe o nome do projeto" }, { status: 400 });
  }

  const resolve = await resolveContextoForProjetoNome(nome);
  return NextResponse.json({ ok: true, resolve });
}
