import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acessoPrestacaoProjeto } from "@/lib/prestacao/acesso";
import { lerArquivoPrivado } from "@/lib/storage/privado";

export const runtime = "nodejs";

/** Baixa um relatório gerado (quem tem acesso ao projeto). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rel = await prisma.prestacaoRelatorio.findUnique({ where: { id } });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  const acesso = await acessoPrestacaoProjeto(rel.projetoId);
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const buffer = await lerArquivoPrivado(rel.storagePath);
  const nome = `${rel.titulo} · ${rel.createdAt.toISOString().slice(0, 10)}.pdf`.replace(/[\\/:*?"<>|\r\n]/g, "-");
  const disposicao = new URL(req.url).searchParams.get("baixar") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `${disposicao}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
