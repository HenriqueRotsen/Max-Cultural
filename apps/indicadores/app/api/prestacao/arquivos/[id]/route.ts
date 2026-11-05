import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acessoPrestacaoProjeto } from "@/lib/prestacao/acesso";
import { lerArquivoPrivado } from "@/lib/storage/privado";

export const runtime = "nodejs";

/** Foto ou documento da prestação de contas (só para quem tem acesso ao projeto). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const arq = await prisma.prestacaoArquivo.findUnique({ where: { id } });
  if (!arq) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const acesso = await acessoPrestacaoProjeto(arq.projetoId);
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const buffer = await lerArquivoPrivado(arq.storagePath);
  const nome = (arq.nomeOriginal || `arquivo-${arq.id}`).replace(/["\\\r\n]/g, "");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": arq.mime,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
