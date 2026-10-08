import { mkdir, unlink, writeFile, readFile, rm } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
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

function runGs(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("gs", args, { stdio: "ignore" });
    child.on("error", () =>
      reject(new Error("Ghostscript (gs) não disponível para unir PDFs.")),
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Falha ao unir PDFs com Ghostscript."));
    });
  });
}

async function writeTempPdfFromSource(
  source: MergeSource,
  tmpDir: string,
  index: number,
) {
  const bytes = await readPlanningDocumentBytes(source.storagePath);
  const out = path.join(tmpDir, `part-${index}.pdf`);

  if (isPdfDocument(source.mimeType, source.filename, source.storagePath)) {
    await writeFile(out, bytes);
    return out;
  }

  if (isImageDocument(source.mimeType, source.filename)) {
    const imgPath = path.join(tmpDir, `part-${index}-img`);
    await writeFile(imgPath, bytes);
    await runGs([
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${out}`,
      imgPath,
    ]);
    await unlink(imgPath).catch(() => undefined);
    return out;
  }

  throw new Error(`Formato não suportado para envio SALIC: ${source.filename}`);
}

/**
 * Une NF/RPA + comprovante (ou vários PDFs/imagens) em um único PDF.
 * Ordem: fiscal primeiro, comprovante depois. Resultado vai ao Storage.
 */
export async function mergeDocumentsToPdf(
  sources: MergeSource[],
  outputBasename: string,
): Promise<{ storagePath: string; byteSize: number }> {
  if (sources.length === 0) {
    throw new Error("Nenhum documento para unir.");
  }

  const tmpDir = path.join(
    tmpdir(),
    `origem-merge-${randomBytes(6).toString("hex")}`,
  );
  await mkdir(tmpDir, { recursive: true });

  try {
    const partPaths: string[] = [];
    for (let i = 0; i < sources.length; i++) {
      partPaths.push(await writeTempPdfFromSource(sources[i]!, tmpDir, i));
    }

    const safe = outputBasename.replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const outPath = path.join(tmpDir, `${safe}.pdf`);

    if (partPaths.length === 1) {
      const single = await readFile(partPaths[0]!);
      await writeFile(outPath, single);
    } else {
      await runGs([
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/ebook",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${outPath}`,
        ...partPaths,
      ]);
    }

    const merged = await readFile(outPath);
    if (merged.length === 0) {
      throw new Error("PDF unificado ficou vazio.");
    }

    const storagePath = await uploadObject({
      bucket: docsBucket(),
      key: `planning/salic-merge/${Date.now()}-${safe}.pdf`,
      buffer: merged,
      contentType: "application/pdf",
      isPublic: false,
    });

    return { storagePath, byteSize: merged.length };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
