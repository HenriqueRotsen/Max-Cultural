import { PDFDocument } from "pdf-lib";
import {
  isImageDocument,
  isPdfDocument,
  readPlanningDocumentBytes,
} from "@/lib/nf/read-document-bytes";
import { docsBucket, uploadObject } from "@/lib/storage/object-store";

export type MergeSource = {
  storagePath: string;
  mimeType: string;
  filename: string;
};

/** A4 em pontos: a imagem é encaixada na página, sem distorcer. */
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 24;

const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;
const isPng = (b: Uint8Array) =>
  b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

async function appendSource(out: PDFDocument, source: MergeSource) {
  const bytes = new Uint8Array(await readPlanningDocumentBytes(source.storagePath));

  if (isPdfDocument(source.mimeType, source.filename, source.storagePath)) {
    let src: PDFDocument;
    try {
      // PDF de banco às vezes vem "protegido" só contra edição: dá para copiar as páginas.
      src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch {
      throw new Error(
        `Não foi possível ler o PDF ${source.filename}. Gere o arquivo de novo (ou salve como PDF) e envie outra vez.`,
      );
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
    return;
  }

  if (isImageDocument(source.mimeType, source.filename)) {
    const image = isJpeg(bytes)
      ? await out.embedJpg(bytes)
      : isPng(bytes)
        ? await out.embedPng(bytes)
        : null;
    if (!image) {
      throw new Error(
        `A imagem ${source.filename} não está em JPG nem PNG. Envie em PDF, JPG ou PNG.`,
      );
    }
    const page = out.addPage([A4.width, A4.height]);
    const scale = Math.min(
      (A4.width - MARGIN * 2) / image.width,
      (A4.height - MARGIN * 2) / image.height,
      1,
    );
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, {
      x: (A4.width - w) / 2,
      y: (A4.height - h) / 2,
      width: w,
      height: h,
    });
    return;
  }

  throw new Error(`Formato não suportado para envio SALIC: ${source.filename}`);
}

/**
 * Une NF/RPA, documentos de apoio e comprovante (PDFs ou imagens) em um único
 * PDF, na ordem recebida. Feito em JavaScript (pdf-lib): não depende de
 * programa instalado no servidor. Resultado vai ao Storage.
 */
export async function mergeDocumentsToPdf(
  sources: MergeSource[],
  outputBasename: string,
): Promise<{ storagePath: string; byteSize: number }> {
  if (sources.length === 0) {
    throw new Error("Nenhum documento para unir.");
  }

  const out = await PDFDocument.create();
  for (const source of sources) {
    await appendSource(out, source);
  }
  if (out.getPageCount() === 0) {
    throw new Error("PDF unificado ficou vazio.");
  }
  const merged = Buffer.from(await out.save({ useObjectStreams: true }));

  const safe = outputBasename.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const storagePath = await uploadObject({
    bucket: docsBucket(),
    key: `planning/salic-merge/${Date.now()}-${safe}.pdf`,
    buffer: merged,
    contentType: "application/pdf",
    isPublic: false,
  });

  return { storagePath, byteSize: merged.length };
}
