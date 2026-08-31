import { access, readFile } from "fs/promises";
import { gunzipSync } from "zlib";

export async function readPlanningDocumentBytes(storagePath: string): Promise<Buffer> {
  await access(storagePath);
  const raw = await readFile(storagePath);
  if (storagePath.endsWith(".gz")) {
    return gunzipSync(raw);
  }
  return raw;
}

export function isPdfDocument(mimeType: string, filename: string, storagePath: string): boolean {
  const m = mimeType.toLowerCase();
  const name = filename.toLowerCase();
  const stored = storagePath.toLowerCase();
  return m.includes("pdf") || name.endsWith(".pdf") || stored.endsWith(".pdf");
}

export function isImageDocument(mimeType: string, filename: string): boolean {
  const m = mimeType.toLowerCase();
  const f = filename.toLowerCase();
  return m.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f);
}
