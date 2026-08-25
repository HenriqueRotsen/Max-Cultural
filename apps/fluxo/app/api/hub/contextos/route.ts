import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHubSession } from "@/lib/hub/auth";
import { programaStem } from "@/lib/programa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireHubSession(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim();
  const rows = await prisma.contexto.findMany({
    where: q
      ? { nome: { contains: q, mode: "insensitive" } }
      : undefined,
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
    take: 200,
  });

  return NextResponse.json({
    ok: true,
    contextos: rows.map((c) => ({
      id: c.id,
      nome: c.nome,
      stem: programaStem(c.nome),
    })),
  });
}
