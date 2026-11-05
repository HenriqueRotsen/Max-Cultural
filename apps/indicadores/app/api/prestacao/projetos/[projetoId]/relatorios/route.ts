import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acessoPrestacaoProjeto } from "@/lib/prestacao/acesso";
import { gerarRelatorioPrestacao } from "@/lib/prestacao/relatorio/gerar";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Gera o relatório em PDF da prestação de contas (gestão). */
export async function POST(req: Request, { params }: { params: Promise<{ projetoId: string }> }) {
  const { projetoId } = await params;
  const acesso = await acessoPrestacaoProjeto(projetoId, { gestao: true });
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const body = (await req.json().catch(() => ({}))) as { produtoId?: string | null; listaNominal?: boolean };
  const produtoId = body.produtoId || null;
  if (produtoId && !(await prisma.prestacaoProduto.findFirst({ where: { id: produtoId, projetoId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  }
  try {
    const rel = await gerarRelatorioPrestacao({ projetoId, produtoId, listaNominal: Boolean(body.listaNominal), userId: acesso.user.id });
    await writeAuditLog({
      actorUserId: acesso.user.id,
      action: "prestacao.relatorio",
      entityType: "Projeto",
      entityId: projetoId,
      meta: { relatorioId: rel.id, produtoId, listaNominal: Boolean(body.listaNominal) },
    });
    return NextResponse.json({ ok: true, id: rel.id });
  } catch (e) {
    console.error("[prestacao] relatório falhou", e);
    return NextResponse.json({ error: "Não foi possível gerar o relatório." }, { status: 500 });
  }
}
