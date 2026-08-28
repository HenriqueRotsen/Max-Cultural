import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { promisify } from "util";
import { gzip } from "zlib";

const gzipAsync = promisify(gzip);

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "planning");

export async function ensureUploadDir() {
  await mkdir(UPLOAD_ROOT, { recursive: true });
}

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
 * Comprime PDF via Ghostscript se disponível; senão grava bytes originais.
 * XML/outros: gzip opcional só se ajudar (mantém extensão .gz no path interno).
 */
export async function storeCompressedDocument(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<{ storagePath: string; byteSize: number; originalByteSize: number }> {
  await ensureUploadDir();
  const originalByteSize = params.buffer.length;
  const safe = params.filename.replace(/[^\w.\-]+/g, "_").slice(0, 160);
  const stamp = Date.now();
  const isPdf =
    params.mimeType.includes("pdf") || /\.pdf$/i.test(params.filename);

  if (isPdf) {
    const rawPath = path.join(UPLOAD_ROOT, `${safe}-${stamp}-raw`);
    const outPath = path.join(UPLOAD_ROOT, `${safe}-${stamp}`);
    await writeFile(rawPath, params.buffer);
    const ok = await runGs(rawPath, outPath);
    if (ok) {
      const { readFile, unlink } = await import("fs/promises");
      const compressed = await readFile(outPath);
      await unlink(rawPath).catch(() => undefined);
      if (compressed.length > 0 && compressed.length < originalByteSize) {
        return {
          storagePath: outPath,
          byteSize: compressed.length,
          originalByteSize,
        };
      }
    }
    const finalPath = path.join(UPLOAD_ROOT, `${safe}-${stamp}`);
    await writeFile(finalPath, params.buffer);
    return { storagePath: finalPath, byteSize: originalByteSize, originalByteSize };
  }

  // XML / texto: gzip
  if (
    params.mimeType.includes("xml") ||
    params.mimeType.includes("text") ||
    /\.(xml|txt|csv)$/i.test(params.filename)
  ) {
    const gz = await gzipAsync(params.buffer);
    const finalPath = path.join(UPLOAD_ROOT, `${safe}-${stamp}.gz`);
    await writeFile(finalPath, gz);
    return {
      storagePath: finalPath,
      byteSize: gz.length,
      originalByteSize,
    };
  }

  const finalPath = path.join(UPLOAD_ROOT, `${safe}-${stamp}`);
  await writeFile(finalPath, params.buffer);
  return { storagePath: finalPath, byteSize: originalByteSize, originalByteSize };
}
