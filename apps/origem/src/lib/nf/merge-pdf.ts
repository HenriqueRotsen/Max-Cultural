import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import {
  isImageDocument,
  isPdfDocument,
  readPlanningDocumentBytes,
} from "@/lib/nf/read-document-bytes";

const SALIC_MERGE_ROOT = path.join(process.cwd(), "uploads", "planning", "salic-merge");

export type MergeSource = {
  storagePath: string;
  mimeType: string;
  filename: string;
};

function runGs(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("gs", args, { stdio: "ignore" });
    child.on("error", () => reject(new Error("Ghostscript (gs) não disponível para unir PDFs.")));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Falha ao unir PDFs com Ghostscript."));
    });
  });
}

async function writeTempPdfFromSource(source: MergeSource, tmpDir: string, index: number) {
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
 * Ordem: fiscal primeiro, comprovante depois.
 */
export async function mergeDocumentsToPdf(
  sources: MergeSource[],
  outputBasename: string,
): Promise<{ storagePath: string; byteSize: number }> {
  if (sources.length === 0) {
    throw new Error("Nenhum documento para unir.");
  }

  await mkdir(SALIC_MERGE_ROOT, { recursive: true });
  const tmpDir = path.join(tmpdir(), `origem-merge-${randomBytes(6).toString("hex")}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    const partPaths: string[] = [];
    for (let i = 0; i < sources.length; i++) {
      partPaths.push(await writeTempPdfFromSource(sources[i]!, tmpDir, i));
    }

    const safe = outputBasename.replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const outPath = path.join(SALIC_MERGE_ROOT, `${safe}-${Date.now()}.pdf`);

    if (partPaths.length === 1) {
      const single = await readPlanningDocumentBytes(partPaths[0]!);
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

    const { readFile } = await import("fs/promises");
    const merged = await readFile(outPath);
    if (merged.length === 0) {
      throw new Error("PDF unificado ficou vazio.");
    }

    return { storagePath: outPath, byteSize: merged.length };
  } finally {
    const { rm } = await import("fs/promises");
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
