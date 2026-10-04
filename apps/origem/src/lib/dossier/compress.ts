import { createHash } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { promisify } from "util";
import { gzip } from "zlib";

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

export type CompressedArtifact = {
  /** Bytes legíveis no ZIP (PDF otimizado; CSV/TXT sem gzip). */
  buffer: Buffer;
  relativePath: string;
  mimeType: string;
  originalBytes: number;
  storedBytes: number;
  /** SHA-256 do conteúdo lógico (antes de qualquer gzip de storage). */
  sha256: string;
};

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function isTexty(mimeType: string, filename: string): boolean {
  const m = mimeType.toLowerCase();
  const f = filename.toLowerCase();
  return (
    m.includes("xml") ||
    m.includes("text") ||
    m.includes("json") ||
    m.includes("csv") ||
    /\.(xml|txt|csv|json)$/i.test(f)
  );
}

function isPdf(mimeType: string, filename: string): boolean {
  return mimeType.includes("pdf") || /\.pdf$/i.test(filename);
}

/** Gzip nível 9 para upload solto no Storage (pastas 01–05). */
export async function gzipForStorage(buffer: Buffer): Promise<Buffer> {
  return gzipAsync(buffer, { level: 9 });
}

export function shouldGzipForStorage(mimeType: string, filename: string): boolean {
  return isTexty(mimeType, filename);
}

/**
 * Prepara artefato para o ZIP do usuário:
 * - PDF → Ghostscript /ebook se disponível
 * - Texto/CSV → mantém legível (deflate do ZIP)
 * - Demais → bytes originais
 */
export async function prepareArtifact(params: {
  buffer: Buffer;
  relativePath: string;
  mimeType: string;
  workDir: string;
}): Promise<CompressedArtifact> {
  const originalBytes = params.buffer.length;
  const sha256 = sha256Hex(params.buffer);
  const filename = path.basename(params.relativePath);

  if (isPdf(params.mimeType, filename)) {
    await mkdir(params.workDir, { recursive: true });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rawPath = path.join(params.workDir, `${stamp}-raw.pdf`);
    const outPath = path.join(params.workDir, `${stamp}-out.pdf`);
    await writeFile(rawPath, params.buffer);
    const ok = await runGs(rawPath, outPath);
    let out = params.buffer;
    if (ok) {
      try {
        const compressed = await readFile(outPath);
        if (compressed.length > 0 && compressed.length < originalBytes) {
          out = compressed;
        }
      } catch {
        /* keep original */
      }
    }
    await unlink(rawPath).catch(() => undefined);
    await unlink(outPath).catch(() => undefined);
    return {
      buffer: out,
      relativePath: params.relativePath,
      mimeType: "application/pdf",
      originalBytes,
      storedBytes: out.length,
      sha256,
    };
  }

  return {
    buffer: params.buffer,
    relativePath: params.relativePath,
    mimeType: params.mimeType,
    originalBytes,
    storedBytes: originalBytes,
    sha256,
  };
}

export type ManifestEntry = {
  path: string;
  mime: string;
  originalBytes: number;
  storedBytes: number;
  sha256: string;
};

export type DossierManifest = {
  version: 1;
  workspaceId: string;
  accountId: string;
  pronac: string;
  projectName: string | null;
  generatedAt: string;
  files: ManifestEntry[];
  zipStoredBytes?: number;
  limitations?: string[];
};
