/** Paths estáveis do dossiê — sem jobId (overwrite idempotente). */

export function slugifyName(name: string | null | undefined, max = 48): string {
  const base = String(name || "projeto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, max);
  return base || "projeto";
}

export function pronacFolderSlug(pronac: string, projectName?: string | null): string {
  const n = String(pronac || "").replace(/\D/g, "") || "0";
  return `PRONAC_${n}_${slugifyName(projectName)}`;
}

export function accountStoragePrefix(workspaceId: string, accountId: string): string {
  return `dossiers/${workspaceId}/${accountId}`;
}

export function pronacStoragePrefix(
  workspaceId: string,
  accountId: string,
  pronac: string,
  projectName?: string | null,
): string {
  const slug = pronacFolderSlug(pronac, projectName);
  return `${accountStoragePrefix(workspaceId, accountId)}/${slug}`;
}

export function pronacZipStoragePath(
  workspaceId: string,
  accountId: string,
  pronac: string,
  projectName?: string | null,
): string {
  const slug = pronacFolderSlug(pronac, projectName);
  return `${accountStoragePrefix(workspaceId, accountId)}/${slug}.zip`;
}

/** ZIP único com todos os PRONACs do job (para um botão de download). */
export function accountAggregateZipPath(workspaceId: string, accountId: string): string {
  return `${accountStoragePrefix(workspaceId, accountId)}/dossie-completo.zip`;
}

export const DOSSIER_FOLDERS = [
  "01_espelho_pronac",
  "02_planilha_homologada",
  "03_situacao_diligencias",
  "04_readequacao",
  "05_pagamentos_comprovantes",
] as const;
