import { gunzipSync } from "zlib";
import { downloadObject, isSupabaseStoragePath } from "@/lib/storage/object-store";

export async function readPlanningDocumentBytes(storagePath: string): Promise<Buffer> {
  const raw = await downloadObject(storagePath);
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

export function isStoredGzip(storagePath: string): boolean {
  return storagePath.endsWith(".gz");
}

export function storageKind(storagePath: string): "supabase" | "local" {
  return isSupabaseStoragePath(storagePath) ? "supabase" : "local";
}
