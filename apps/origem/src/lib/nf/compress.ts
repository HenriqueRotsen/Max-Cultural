import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { promisify } from "util";
import { gzip } from "zlib";
import { uploadPlanningDocument } from "@/lib/storage/object-store";

const gzipAsync = promisify(gzip);

function runGs(input: string, output: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      "gs",
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/ebook",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${output}`,
        input,
      ],
      { stdio: "ignore" },
    );
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Comprime PDF via Ghostscript (/ebook = legível e mais leve) quando `gs` existe.
 * XML/texto: gzip. Imagens e demais: mantém bytes (definição preservada).
 * Grava no Supabase Storage (ou disco local se STORAGE_DRIVER=local).
 */
export async function storeCompressedDocument(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  workspaceId: string;
}): Promise<{ storagePath: string; byteSize: number; originalByteSize: number }> {
  const originalByteSize = params.buffer.length;
  const safe = params.filename.replace(/[^\w.\-]+/g, "_").slice(0, 160);
  const isPdf =
    params.mimeType.includes("pdf") || /\.pdf$/i.test(params.filename);

  let outBuffer = params.buffer;
  let outName = safe;
  let contentType = params.mimeType || "application/octet-stream";

  if (isPdf) {
    const work = path.join(
      tmpdir(),
      `origem-pdf-${randomBytes(6).toString("hex")}`,
    );
    await mkdir(work, { recursive: true });
    const rawPath = path.join(work, "raw.pdf");
    const outPath = path.join(work, "out.pdf");
    try {
      await writeFile(rawPath, params.buffer);
      const ok = await runGs(rawPath, outPath);
      if (ok) {
        const compressed = await readFile(outPath);
        if (compressed.length > 0 && compressed.length < originalByteSize) {
          outBuffer = compressed;
        }
      }
    } finally {
      await unlink(rawPath).catch(() => undefined);
      await unlink(outPath).catch(() => undefined);
    }
    if (!/\.pdf$/i.test(outName)) outName = `${outName}.pdf`;
    contentType = "application/pdf";
  } else if (
    params.mimeType.includes("xml") ||
    params.mimeType.includes("text") ||
    /\.(xml|txt|csv)$/i.test(params.filename)
  ) {
    const gz = await gzipAsync(params.buffer);
    if (gz.length < originalByteSize) {
      outBuffer = gz;
      outName = /\.gz$/i.test(outName) ? outName : `${outName}.gz`;
      contentType = "application/gzip";
    }
  }
  // Imagens (comprovante foto etc.): sem recompressão agressiva — mantém definição.

  const storagePath = await uploadPlanningDocument({
    workspaceId: params.workspaceId,
    filename: outName,
    buffer: outBuffer,
    contentType,
  });

  return {
    storagePath,
    byteSize: outBuffer.length,
    originalByteSize,
  };
}
