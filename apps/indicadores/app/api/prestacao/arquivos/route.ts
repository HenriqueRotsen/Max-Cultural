import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acessoPrestacaoProjeto } from "@/lib/prestacao/acesso";
import { salvarArquivoPrivado } from "@/lib/storage/privado";
import { CATEGORIAS_DOC, CATEGORIAS_FOTO } from "@/lib/prestacao/types";

export const runtime = "nodejs";

/** Fotos chegam já comprimidas pelo navegador; documentos (PDF) como vieram. */
const LIMITE = { FOTO: 6 * 1024 * 1024, DOCUMENTO: 4 * 1024 * 1024 } as const;

function tipoReal(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (b.length > 5 && b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

/** Envio de foto ou documento para a ficha de uma execução. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  const agendaId = String(form.get("agendaId") || "");
  const tipo = String(form.get("tipo") || "") as "FOTO" | "DOCUMENTO";
  const categoria = String(form.get("categoria") || "");
  const descricao = String(form.get("descricao") || "").trim().slice(0, 600);
  const largura = Number(form.get("largura")) || null;
  const altura = Number(form.get("altura")) || null;
  const arquivo = form.get("arquivo");
  if (tipo !== "FOTO" && tipo !== "DOCUMENTO") return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  const categorias: readonly { value: string }[] = tipo === "FOTO" ? CATEGORIAS_FOTO : CATEGORIAS_DOC;
  if (!categorias.some((c) => c.value === categoria)) return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  if (!(arquivo instanceof File)) return NextResponse.json({ error: "Nenhum arquivo." }, { status: 400 });
  if (arquivo.size > LIMITE[tipo]) {
    return NextResponse.json(
      { error: tipo === "DOCUMENTO" ? "PDF acima de 4 MB: use o link do drive na ficha." : "Foto grande demais." },
      { status: 413 },
    );
  }

  const agenda = await prisma.acaoAgenda.findUnique({ where: { id: agendaId }, select: { id: true, acao: { select: { projetoId: true } } } });
  if (!agenda) return NextResponse.json({ error: "Execução não encontrada." }, { status: 404 });
  const projetoId = agenda.acao.projetoId;
  const acesso = await acessoPrestacaoProjeto(projetoId, { escrever: true });
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const mime = tipoReal(buffer);
  const aceito = tipo === "FOTO" ? mime?.startsWith("image/") : mime === "application/pdf";
  if (!mime || !aceito) {
    return NextResponse.json({ error: tipo === "FOTO" ? "Envie uma imagem JPG, PNG ou WebP." : "Envie um PDF." }, { status: 415 });
  }
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[mime]!;

  const ficha = await prisma.prestacaoFicha.upsert({ where: { agendaId }, create: { agendaId, projetoId }, update: {} });
  const chave = `projetos/${projetoId}/${agendaId}/${tipo === "FOTO" ? "fotos" : "documentos"}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const storagePath = await salvarArquivoPrivado(chave, buffer, mime);
  const ultima = await prisma.prestacaoArquivo.aggregate({ where: { fichaId: ficha.id, categoria }, _max: { ordem: true } });
  const criado = await prisma.prestacaoArquivo.create({
    data: {
      fichaId: ficha.id,
      projetoId,
      tipo,
      categoria,
      descricao,
      ordem: (ultima._max.ordem ?? 0) + 1,
      storagePath,
      nomeOriginal: arquivo.name.slice(0, 200),
      mime,
      tamanho: buffer.length,
      largura,
      altura,
      enviadoPor: acesso.user.id,
    },
  });
  return NextResponse.json({ ok: true, id: criado.id });
}
