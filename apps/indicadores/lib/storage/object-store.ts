import { createServiceClient } from "@/lib/supabase/admin";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export function publicBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET_PUBLIC?.trim() || "max-public";
}

export function useSupabaseStorage(): boolean {
  if (process.env.STORAGE_DRIVER === "local") return false;
  if (process.env.STORAGE_DRIVER === "supabase") return true;
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

const ensured = new Set<string>();

async function ensurePublicBucket(bucket: string) {
  if (ensured.has(bucket)) return;
  const admin = createServiceClient();
  const { data: list } = await admin.storage.listBuckets();
  if (!list?.some((b) => b.name === bucket)) {
    const { error } = await admin.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ],
    });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Falha ao criar bucket «${bucket}»: ${error.message}`);
    }
  }
  ensured.add(bucket);
}

/** Upload de imagem pública (capas). Sem recompressão agressiva. */
export async function uploadPublicImage(params: {
  folder: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const safe = params.filename.replace(/[^\w.\-]+/g, "_").slice(0, 160);
  const key = `${params.folder}/${Date.now()}-${safe}`;

  if (!useSupabaseStorage()) {
    const dir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "formularios",
      "capas",
    );
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, safe), params.buffer);
    return `/uploads/formularios/capas/${safe}`;
  }

  const bucket = publicBucket();
  await ensurePublicBucket(bucket);
  const admin = createServiceClient();
  const { error } = await admin.storage.from(bucket).upload(key, params.buffer, {
    contentType: params.contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Upload Storage falhou: ${error.message}`);
  }
  const { data } = admin.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl;
}
