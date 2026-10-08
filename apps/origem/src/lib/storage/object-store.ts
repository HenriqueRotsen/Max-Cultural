import { createAdminClient } from "@/lib/supabase/admin";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

/** Prefixo gravado em PlanningDocument.storagePath. */
export const SB_PREFIX = "sb://";

export function docsBucket(): string {
  return (
    process.env.SUPABASE_STORAGE_BUCKET_DOCS?.trim() ||
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    "max-docs"
  );
}

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

export function isSupabaseStoragePath(storagePath: string): boolean {
  return storagePath.startsWith(SB_PREFIX);
}

export function encodeStoragePath(bucket: string, key: string): string {
  const cleanKey = key.replace(/^\/+/, "");
  return `${SB_PREFIX}${bucket}/${cleanKey}`;
}

export function parseStoragePath(
  storagePath: string,
): { bucket: string; key: string } | null {
  if (!isSupabaseStoragePath(storagePath)) return null;
  const rest = storagePath.slice(SB_PREFIX.length);
  const i = rest.indexOf("/");
  if (i <= 0) return null;
  return { bucket: rest.slice(0, i), key: rest.slice(i + 1) };
}

const ensuredBuckets = new Set<string>();

async function ensureBucket(bucket: string, isPublic: boolean) {
  if (ensuredBuckets.has(bucket)) return;
  const admin = createAdminClient();
  const { data: list } = await admin.storage.listBuckets();
  const exists = list?.some((b) => b.name === bucket);
  if (!exists) {
    const { error } = await admin.storage.createBucket(bucket, {
      public: isPublic,
      fileSizeLimit: isPublic ? 5 * 1024 * 1024 : 52_428_800, // 5 MB capas / 50 MB docs
      allowedMimeTypes: isPublic
        ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
        : undefined,
    });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Falha ao criar bucket «${bucket}»: ${error.message}`);
    }
  }
  ensuredBuckets.add(bucket);
}

export async function uploadObject(params: {
  bucket: string;
  key: string;
  buffer: Buffer;
  contentType: string;
  isPublic?: boolean;
}): Promise<string> {
  if (!useSupabaseStorage()) {
    const root = path.join(process.cwd(), "uploads", "object-store", params.bucket);
    await mkdir(path.dirname(path.join(root, params.key)), { recursive: true });
    const abs = path.join(root, params.key);
    await writeFile(abs, params.buffer);
    return abs;
  }

  await ensureBucket(params.bucket, Boolean(params.isPublic));
  const admin = createAdminClient();
  const { error } = await admin.storage.from(params.bucket).upload(params.key, params.buffer, {
    contentType: params.contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Upload Storage falhou: ${error.message}`);
  }
  return encodeStoragePath(params.bucket, params.key);
}

export async function downloadObject(storagePath: string): Promise<Buffer> {
  const remote = parseStoragePath(storagePath);
  if (!remote) {
    return readFile(storagePath);
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(remote.bucket)
    .download(remote.key);
  if (error || !data) {
    throw new Error(
      `Download Storage falhou: ${error?.message || "arquivo ausente"}`,
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteObject(storagePath: string): Promise<void> {
  const remote = parseStoragePath(storagePath);
  if (!remote) {
    await unlink(storagePath).catch(() => undefined);
    return;
  }
  const admin = createAdminClient();
  await admin.storage.from(remote.bucket).remove([remote.key]);
}

/** URL pública (bucket público) ou signed (privado, 1h). */
export async function resolveObjectUrl(storagePath: string): Promise<string> {
  const remote = parseStoragePath(storagePath);
  if (!remote) {
    // path local /uploads legado
    if (storagePath.startsWith("/uploads/")) return storagePath;
    throw new Error("Path local não é servível por URL pública");
  }
  const admin = createAdminClient();
  if (remote.bucket === publicBucket()) {
    const { data } = admin.storage.from(remote.bucket).getPublicUrl(remote.key);
    return data.publicUrl;
  }
  const { data, error } = await admin.storage
    .from(remote.bucket)
    .createSignedUrl(remote.key, 60 * 60);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Falha ao assinar URL");
  }
  return data.signedUrl;
}

export async function uploadPlanningDocument(params: {
  workspaceId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const safe = params.filename.replace(/[^\w.\-]+/g, "_").slice(0, 160);
  const key = `planning/${params.workspaceId}/${Date.now()}-${safe}`;
  return uploadObject({
    bucket: docsBucket(),
    key,
    buffer: params.buffer,
    contentType: params.contentType,
    isPublic: false,
  });
}

export async function uploadPublicImage(params: {
  folder: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ storagePath: string; publicUrl: string }> {
  const safe = params.filename.replace(/[^\w.\-]+/g, "_").slice(0, 160);
  const key = `${params.folder}/${Date.now()}-${safe}`;
  const storagePath = await uploadObject({
    bucket: publicBucket(),
    key,
    buffer: params.buffer,
    contentType: params.contentType,
    isPublic: true,
  });
  if (!useSupabaseStorage()) {
    // Dev local: servir via path relativo se estiver sob public/
    return { storagePath, publicUrl: storagePath };
  }
  const publicUrl = await resolveObjectUrl(storagePath);
  return { storagePath, publicUrl };
}
