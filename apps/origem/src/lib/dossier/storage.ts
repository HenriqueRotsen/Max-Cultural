import { createAdminClient } from "@/lib/supabase/admin";
import {
  gzipForStorage,
  shouldGzipForStorage,
  type CompressedArtifact,
  type DossierManifest,
} from "@/lib/dossier/compress";

export const DOSSIERS_BUCKET = "dossiers";

function admin() {
  return createAdminClient();
}

/** Lista e remove todos os objetos sob um prefixo (inclui ZIP se passado como path exato). */
export async function deleteStoragePrefix(prefix: string): Promise<void> {
  const supabase = admin();
  const normalized = prefix.replace(/\/+$/, "");

  const pageSize = 100;
  for (;;) {
    const { data, error } = await supabase.storage.from(DOSSIERS_BUCKET).list(normalized, {
      limit: pageSize,
      offset: 0,
    });
    if (error) {
      // Prefixo inexistente não é erro fatal
      if (/not found|does not exist/i.test(error.message)) return;
      throw new Error(`Storage list (${normalized}): ${error.message}`);
    }
    if (!data?.length) break;

    const files = data.filter((f) => Boolean(f.id));
    const dirs = data.filter((f) => !f.id && f.name);

    if (files.length) {
      const paths = files.map((f) => `${normalized}/${f.name}`);
      const { error: delErr } = await supabase.storage.from(DOSSIERS_BUCKET).remove(paths);
      if (delErr) throw new Error(`Storage remove: ${delErr.message}`);
    }

    for (const dir of dirs) {
      await deleteStoragePrefix(`${normalized}/${dir.name}`);
    }

    // Após remover, relista do início; se só restarem dirs já apagados recursivamente, sai.
    if (!files.length && !dirs.length) break;
    if (!files.length) break;
  }
}

/** Apaga pasta do PRONAC e o ZIP irmão (paths determinísticos). */
export async function deletePronacDossier(params: {
  folderPrefix: string;
  zipPath: string;
}): Promise<void> {
  const supabase = admin();
  await deleteStoragePrefix(params.folderPrefix);
  const { error } = await supabase.storage.from(DOSSIERS_BUCKET).remove([params.zipPath]);
  if (error && !/not found|does not exist/i.test(error.message)) {
    // remove de objeto inexistente costuma retornar ok; se falhar, ignora
  }
}

async function uploadBytes(
  storagePath: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const supabase = admin();
  const { error } = await supabase.storage.from(DOSSIERS_BUCKET).upload(storagePath, body, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Storage upload (${storagePath}): ${error.message}`);
}

/** Upload das pastas + MANIFEST + ZIP (overwrite via upsert). */
export async function uploadPronacDossier(params: {
  folderPrefix: string;
  zipPath: string;
  zipBuffer: Buffer;
  artifacts: CompressedArtifact[];
  manifest: DossierManifest;
}): Promise<{ uploadedPaths: string[]; zipStoredBytes: number }> {
  const uploadedPaths: string[] = [];

  for (const art of params.artifacts) {
    let body = art.buffer;
    let storageRel = art.relativePath;
    let contentType = art.mimeType || "application/octet-stream";

    if (shouldGzipForStorage(art.mimeType, art.relativePath)) {
      body = await gzipForStorage(art.buffer);
      if (!storageRel.endsWith(".gz")) storageRel = `${storageRel}.gz`;
      contentType = "application/gzip";
    }

    const storagePath = `${params.folderPrefix}/${storageRel}`;
    await uploadBytes(storagePath, body, contentType);
    uploadedPaths.push(storagePath);
  }

  const manifestPath = `${params.folderPrefix}/MANIFEST.json`;
  const manifestBody = Buffer.from(JSON.stringify(params.manifest, null, 2), "utf8");
  await uploadBytes(manifestPath, manifestBody, "application/json");
  uploadedPaths.push(manifestPath);

  await uploadBytes(params.zipPath, params.zipBuffer, "application/zip");
  uploadedPaths.push(params.zipPath);

  return { uploadedPaths, zipStoredBytes: params.zipBuffer.length };
}

export async function createSignedDownloadUrl(
  storagePath: string,
  expiresInSec = 3600,
): Promise<string> {
  const supabase = admin();
  const { data, error } = await supabase.storage
    .from(DOSSIERS_BUCKET)
    .createSignedUrl(storagePath, expiresInSec);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Falha ao assinar URL de download");
  }
  return data.signedUrl;
}

export async function downloadStorageBytes(storagePath: string): Promise<Buffer> {
  const supabase = admin();
  const { data, error } = await supabase.storage.from(DOSSIERS_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(error?.message || `Falha ao baixar ${storagePath}`);
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

export async function uploadZipBytes(storagePath: string, zipBuffer: Buffer): Promise<void> {
  await uploadBytes(storagePath, zipBuffer, "application/zip");
}
