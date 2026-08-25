import { NextResponse } from "next/server";
import { AUTH_COOKIE, parseSessionToken } from "@max/auth";
import { prisma } from "@/lib/prisma";
import { aggregateSocio } from "@/lib/socio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("x-max-session")?.trim();
  if (header) return header;
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";").map((p) => p.trim())) {
    if (part.startsWith(`${AUTH_COOKIE}=`)) {
      return part.slice(AUTH_COOKIE.length + 1);
    }
  }
  return null;
}

function fluxoBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002").replace(/\/$/, "");
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ pronac: string }> },
) {
  try {
    const token = sessionTokenFromRequest(request);
    const session = token ? await parseSessionToken(token) : null;
    if (!session?.email && !session?.userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { pronac: raw } = await context.params;
    const pronac = decodeURIComponent(raw).trim();
    if (!pronac) {
      return NextResponse.json({ error: "PRONAC inválido" }, { status: 400 });
    }

    const projetos = await prisma.projeto.findMany({
      where: { pronac },
      orderBy: [{ ano: "desc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        proponente: true,
        ano: true,
        _count: { select: { oficinas: true } },
      },
    });

    const aggregates = await prisma.inscricao.aggregate({
      where: { pronac },
      _sum: {
        inscritos: true,
        selecionados: true,
        participantes: true,
        certificado: true,
      },
      _count: { _all: true },
    });

    const oficinasDistinct = await prisma.inscricao.findMany({
      where: { pronac },
      distinct: ["idOficina"],
      select: { idOficina: true },
    });

    const [topEstados, socio] = await Promise.all([
      prisma.inscricao.groupBy({
        by: ["estado"],
        where: { pronac, NOT: { estado: "" } },
        _sum: { inscritos: true },
        orderBy: { _sum: { inscritos: "desc" } },
        take: 8,
      }),
      aggregateSocio({ pronac }),
    ]);

    const inscritos = aggregates._sum.inscritos ?? 0;
    const selecionados = aggregates._sum.selecionados ?? 0;
    const participantes = aggregates._sum.participantes ?? 0;
    const certificados = aggregates._sum.certificado ?? 0;

    const primary = projetos[0] || null;

    return NextResponse.json({
      found: projetos.length > 0 || (aggregates._count._all ?? 0) > 0,
      pronac,
      projetos: projetos.map((p) => ({
        id: p.id,
        nome: p.nome,
        proponente: p.proponente,
        ano: p.ano,
        oficinasCount: p._count.oficinas,
        url: `${fluxoBaseUrl()}/projeto/${p.id}`,
      })),
      totais: {
        inscritos,
        selecionados,
        participantes,
        certificados,
        oficinas: oficinasDistinct.length,
        registros: aggregates._count._all ?? 0,
        taxaSelecao: pct(selecionados, inscritos),
        taxaParticipacao: pct(participantes, selecionados),
        taxaCertificado: pct(certificados, participantes),
      },
      topEstados: topEstados
        .filter((e) => e.estado)
        .map((e) => ({
          estado: e.estado,
          inscritos: e._sum.inscritos ?? 0,
        })),
      socio,
      fluxoUrl: primary
        ? `${fluxoBaseUrl()}/projeto/${primary.id}`
        : `${fluxoBaseUrl()}/dashboard`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
