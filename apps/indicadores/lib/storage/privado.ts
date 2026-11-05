import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { createServiceClient } from "@/lib/supabase/admin";
// Alias: o nome "use…" confunde a regra de hooks do lint (não é um hook).
import { useSupabaseStorage as supabaseAtivo } from "@/lib/storage/object-store";

/**
 * Arquivos privados (prestação de contas): fotos, documentos e relatórios.
 * Supabase Storage em bucket privado; sem Supabase (ambiente local), uma pasta
 * `.storage/` no app, fora do git. O caminho gravado no banco diz onde está:
 * `sb://bucket/chave` ou `local://chave`.
 */

export function bucketPrestacao(): string {
  return process.env.SUPABASE_STORAGE_BUCKET_PRESTACAO?.trim() || "max-prestacao";
}

const PASTA_LOCAL = () => path.join(process.cwd(), ".storage");
let bucketPronto = false;

async function garantirBucket(bucket: string) {
  if (bucketPronto) return;
  const admin = createServiceClient();
  const { data: list } = await admin.storage.listBuckets();
  if (!list?.some((b) => b.name === bucket)) {
    const { error } = await admin.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 25 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Falha ao criar o bucket «${bucket}»: ${error.message}`);
    }
  }
  bucketPronto = true;
}

/** Chave segura: só letras, números, ponto, hífen e barra. */
function chaveSegura(chave: string): string {
  const limpa = chave
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w./-]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\/+/, "");
  if (!limpa || limpa.includes("..")) throw new Error("Chave de arquivo inválida.");
  return limpa.slice(0, 400);
}

export async function salvarArquivoPrivado(chave: string, buffer: Buffer, contentType: string): Promise<string> {
  const key = chaveSegura(chave);
  if (!supabaseAtivo()) {
    const destino = path.join(PASTA_LOCAL(), key);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, buffer);
    return `local://${key}`;
  }
  const bucket = bucketPrestacao();
  await garantirBucket(bucket);
  const { error } = await createServiceClient().storage.from(bucket).upload(key, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Envio ao Storage falhou: ${error.message}`);
  return `sb://${bucket}/${key}`;
}

function separar(storagePath: string): { tipo: "sb"; bucket: string; key: string } | { tipo: "local"; key: string } {
  if (storagePath.startsWith("local://")) return { tipo: "local", key: chaveSegura(storagePath.slice(8)) };
  const m = storagePath.match(/^sb:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error("Caminho de arquivo desconhecido.");
  return { tipo: "sb", bucket: m[1]!, key: m[2]! };
}

export async function lerArquivoPrivado(storagePath: string): Promise<Buffer> {
  const p = separar(storagePath);
  if (p.tipo === "local") return readFile(path.join(PASTA_LOCAL(), p.key));
  const { data, error } = await createServiceClient().storage.from(p.bucket).download(p.key);
  if (error || !data) throw new Error(`Leitura do Storage falhou: ${error?.message ?? "sem dados"}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function removerArquivoPrivado(storagePath: string): Promise<void> {
  const p = separar(storagePath);
  if (p.tipo === "local") {
    await rm(path.join(PASTA_LOCAL(), p.key), { force: true });
    return;
  }
  await createServiceClient().storage.from(p.bucket).remove([p.key]);
}
