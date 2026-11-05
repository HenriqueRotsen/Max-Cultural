import { readFile } from "fs/promises";
import path from "path";
import { createElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { prisma } from "@/lib/prisma";
import { salvarArquivoPrivado } from "@/lib/storage/privado";
import { montarDadosRelatorio } from "@/lib/prestacao/relatorio/dados";
import { DocumentoPrestacao } from "@/lib/prestacao/relatorio/documento";

export const MODELO_POR_PRODUTO = "PRESTACAO_POR_PRODUTO";

async function logo(): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", "max-indicadores.png"));
  } catch {
    return null;
  }
}

/** Gera o PDF, guarda no Storage e registra no histórico do projeto. */
export async function gerarRelatorioPrestacao(params: {
  projetoId: string;
  produtoId: string | null;
  listaNominal: boolean;
  userId: string;
}) {
  const dados = await montarDadosRelatorio(params.projetoId, {
    produtoId: params.produtoId,
    listaNominal: params.listaNominal,
  });
  const elemento = createElement(DocumentoPrestacao, { d: dados, logo: await logo() }) as unknown as ReactElement<DocumentProps>;
  const pdf = await renderToBuffer(elemento);
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = await salvarArquivoPrivado(
    `projetos/${params.projetoId}/relatorios/${carimbo}.pdf`,
    Buffer.from(pdf),
    "application/pdf",
  );
  return prisma.prestacaoRelatorio.create({
    data: {
      projetoId: params.projetoId,
      produtoId: params.produtoId,
      modelo: MODELO_POR_PRODUTO,
      titulo: `${dados.titulo} · ${dados.projeto.nome}`,
      storagePath,
      tamanho: pdf.length,
      geradoPor: params.userId,
    },
  });
}
