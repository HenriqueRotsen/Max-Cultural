import { NextResponse } from "next/server";
import { requireHubSession } from "@/lib/hub/auth";
import {
  ProvisionNeedsContextoError,
  provisionProjetoFromOrigem,
} from "@/lib/hub/provision-projeto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireHubSession(request);
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const pronac = String(body.pronac ?? "").trim();
    const nome = String(body.nome ?? "").trim();
    const proponente = String(body.proponente ?? "").trim();
    const ano = String(body.ano ?? "").trim();
    const contextoId = String(body.contextoId ?? "").trim();
    const contextoNome = String(body.contextoNome ?? "").trim();
    const createContexto = body.createContexto === true || body.createContexto === "true";
    const autoMatchContexto =
      body.autoMatchContexto !== false && body.autoMatchContexto !== "false";

    if (!pronac) {
      return NextResponse.json({ error: "PRONAC inválido" }, { status: 400 });
    }

    const result = await provisionProjetoFromOrigem({
      pronac,
      nome: nome || pronac,
      proponente,
      ano,
      contextoId: contextoId || undefined,
      contextoNome: contextoNome || undefined,
      createContexto,
      autoMatchContexto,
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      contextoCreated: result.contextoCreated,
      projeto: result.projeto,
    });
  } catch (error) {
    if (error instanceof ProvisionNeedsContextoError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          resolve: error.resolve,
        },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
