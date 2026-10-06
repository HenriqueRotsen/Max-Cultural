import type { Page } from "playwright-core";
import { withAccountBrowser } from "@/lib/salic/crawler";
import { resolveIdPronac } from "@/lib/salic/publish-robot";
import { decryptCredential } from "@/lib/crypto";
import { prisma } from "@/lib/db";

const SALIC_BASE = "https://salic.cultura.gov.br";

/** Orçamento total do RPA por PRONAC (Vercel / defaults curtos). */
const RPA_BUDGET_MS = 50_000;
const DEFAULT_MAX_FILES = 20;

export type SalicDownloadedFile = {
  fileId: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
  sourceUrl: string;
};

function isPdf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("utf8") === "%PDF";
}

function looksBinary(buf: Buffer, contentType: string): boolean {
  if (buf.length < 32) return false;
  if (isPdf(buf)) return true;
  if (/octet-stream|pdf|image|zip/i.test(contentType)) return true;
  const head = buf.subarray(0, 64).toString("utf8").toLowerCase();
  if (
    head.includes("<!doctype") ||
    head.includes("<html") ||
    head.includes("erro interno") ||
    head.includes("n&atilde;o existe") ||
    head.includes("não existe")
  ) {
    return false;
  }
  return buf.length > 256;
}

function guessExt(buf: Buffer, contentType: string): string {
  if (isPdf(buf)) return ".pdf";
  if (/jpeg|jpg/i.test(contentType) || buf.subarray(0, 3).toString("hex") === "ffd8ff") {
    return ".jpg";
  }
  if (/png/i.test(contentType) || buf.subarray(0, 4).toString("hex") === "89504e47") {
    return ".png";
  }
  return ".bin";
}

/** Baixa um arquivo do SALIC por idArquivo (sessão autenticada no page). */
export async function fetchArquivoById(
  page: Page,
  fileId: string,
  filenameHint?: string | null,
  idPronac?: string | number | null,
): Promise<SalicDownloadedFile | null> {
  const id = String(fileId || "").replace(/\D/g, "");
  if (!id) return null;

  // URL canônica no SALIC (views usam upload/abrir). /file/getfile devolve 500.
  const warm = idPronac != null ? String(idPronac).replace(/\D/g, "") : "";
  const candidates = [
    ...(warm ? [`/upload/abrir/idpronac/${warm}?id=${id}`] : []),
    `/upload/abrir?id=${id}`,
    `/default/upload/abrir?id=${id}`,
    `/upload/abrir/id/${id}`,
  ];

  for (const path of candidates) {
    try {
      // Base64 via page.evaluate: mantém cookies/Cloudflare e evita Array.from byte-a-byte.
      const result = await page.evaluate(async (p) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45_000);
        try {
          const res = await fetch(p, {
            credentials: "include",
            signal: ctrl.signal,
            headers: {
              Accept: "*/*",
              Referer: `${location.origin}/prestacao-contas/pagamento/`,
            },
          });
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          return {
            ok: res.ok,
            status: res.status,
            ct: res.headers.get("content-type") || "",
            cd: res.headers.get("content-disposition") || "",
            b64: btoa(binary),
          };
        } finally {
          clearTimeout(timer);
        }
      }, path);

      const buffer = Buffer.from(result.b64, "base64");
      if (!result.ok || !looksBinary(buffer, result.ct)) {
        continue;
      }

      let filename =
        filenameHint?.trim() ||
        result.cd.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i)?.[1] ||
        `arquivo-${id}.pdf`;
      try {
        filename = decodeURIComponent(filename.replace(/"/g, ""));
      } catch {
        /* keep */
      }
      if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
        filename = `${filename}${guessExt(buffer, result.ct)}`;
      }

      return {
        fileId: id,
        filename: filename.replace(/[^\w.\- ()]+/g, "_").slice(0, 160),
        buffer,
        mimeType: isPdf(buffer)
          ? "application/pdf"
          : result.ct || "application/octet-stream",
        sourceUrl: `${SALIC_BASE}${path}`,
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

export type PronacSalicFilesResult = {
  payments: SalicDownloadedFile[];
  projectDocs: SalicDownloadedFile[];
  failedFileIds: string[];
  notes: string[];
};

/** Extrai idArquivo + nomes de páginas HTML do SALIC. */
async function collectArquivoLinksFromHtml(
  page: Page,
  urls: string[],
): Promise<Array<{ fileId: string; fileName?: string }>> {
  const found = new Map<string, string | undefined>();
  for (const url of urls) {
    try {
      const items = await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: "include", redirect: "follow" });
        if (!res.ok) return [] as Array<{ id: string; name?: string }>;
        const text = await res.text();
        const out: Array<{ id: string; name?: string }> = [];
        // Ex.: /upload/abrir/idpronac/240054?id=5650771">Nome.pdf
        const re =
          /href=["'][^"']*upload\/abrir[^"']*[?&]id=(\d+)[^"']*["'][^>]*>([^<]{0,200})/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          out.push({ id: m[1]!, name: m[2]?.trim() || undefined });
        }
        const re2 =
          /href=["'][^"']*upload\/abrir(?:\/id\/|\?id=)(\d+)[^"']*["'][^>]*>([^<]{0,200})/gi;
        while ((m = re2.exec(text))) {
          out.push({ id: m[1]!, name: m[2]?.trim() || undefined });
        }
        if (!out.length) {
          for (const hit of text.matchAll(/upload\/abrir[^"'>\s]*[?&\/]id[=\/](\d+)/gi)) {
            out.push({ id: hit[1]! });
          }
        }
        return out;
      }, url);
      for (const it of items) {
        if (!found.has(it.id)) found.set(it.id, it.name);
      }
    } catch {
      /* ignore page */
    }
  }
  return [...found.entries()].map(([fileId, fileName]) => ({ fileId, fileName }));
}

/**
 * Lista anexos de comprovação física / execução (inclui acessibilidade, divulgação etc.)
 * a partir das páginas do módulo comprovacao-objeto.
 */
export async function listPronacExecucaoArquivos(
  page: Page,
  idPronac: string | number,
  idPronacHash?: string | null,
): Promise<Array<{ fileId: string; fileName?: string }>> {
  const tokens = [String(idPronac), idPronacHash].filter(
    (t): t is string => Boolean(t && String(t).length > 0),
  );
  const actions = [
    "comprovantes-de-execucao-final",
    "comprovantes-de-execucao",
    "plano-de-divulgacao-final",
    "plano-de-divulgacao",
    "plano-de-distribuicao-final",
    "plano-de-distribuicao",
    "aceite-de-obra-final",
    "etapas-de-trabalho-final",
    "etapas-de-trabalho",
    "imprimir",
    "visualizar-relatorio-trimestral",
  ];
  const urls: string[] = [];
  for (const token of tokens) {
    for (const action of actions) {
      urls.push(
        `${SALIC_BASE}/comprovacao-objeto/comprovarexecucaofisica/${action}/idpronac/${token}`,
      );
    }
  }
  return collectArquivoLinksFromHtml(page, urls);
}

/**
 * Baixa comprovantes (idArquivo) do PRONAC via sessão SALIC.
 * Com orçamento de tempo — não pode segurar o job inteiro.
 */
export async function downloadPronacSalicFiles(params: {
  accountId: string;
  salicProjectId?: string | null;
  /** Hash criptografado do idPronac (quando disponível). */
  salicProjectHash?: string | null;
  pronac: string;
  files: Array<{ fileId: string; fileName?: string | null }>;
  maxFiles?: number;
  budgetMs?: number;
  /** Também tenta anexos de comprovação física/execução. */
  includeExecucao?: boolean;
}): Promise<PronacSalicFilesResult> {
  const notes: string[] = [];
  const payments: SalicDownloadedFile[] = [];
  const projectDocs: SalicDownloadedFile[] = [];
  const failedFileIds: string[] = [];
  const maxFiles = params.maxFiles ?? DEFAULT_MAX_FILES;
  const budgetMs = params.budgetMs ?? RPA_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  const includeExecucao = params.includeExecucao !== false;

  const unique = new Map<string, string | null | undefined>();
  for (const f of params.files) {
    const id = String(f.fileId || "").replace(/\D/g, "");
    if (id) unique.set(id, f.fileName);
  }
  const list = [...unique.entries()].slice(0, maxFiles);
  const skipped = unique.size - list.length;
  if (skipped > 0) {
    notes.push(
      `RPA limitado a ${maxFiles} arquivo(s) de pagamento; ${skipped} ficaram de fora neste PRONAC.`,
    );
  }
  if (!list.length && !includeExecucao) {
    return {
      payments,
      projectDocs,
      failedFileIds,
      notes: ["Nenhum idArquivo para baixar."],
    };
  }

  const account = await prisma.salicAccount.findUnique({
    where: { id: params.accountId },
  });
  if (!account?.salicUsernameEnc || !account.salicPasswordEnc) {
    notes.push("Conta sem credenciais SALIC — RPA de anexos ignorado.");
    return { payments, projectDocs, failedFileIds: list.map(([id]) => id), notes };
  }
  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) {
    notes.push("Credenciais SALIC inválidas — RPA de anexos ignorado.");
    return { payments, projectDocs, failedFileIds: list.map(([id]) => id), notes };
  }

  try {
    await withAccountBrowser(account.id, username, password, async (page) => {
      let warmId = String(params.salicProjectId || "").match(/^\d+$/)?.[0] || "";
      const hashHint =
        params.salicProjectHash ||
        (params.salicProjectId && !/^\d+$/.test(params.salicProjectId)
          ? params.salicProjectId
          : null);

      if (!warmId) {
        try {
          const id = await resolveIdPronac(page, account.cgccpf, params.pronac);
          warmId = String(id);
        } catch (err) {
          notes.push(
            `Não foi possível resolver idPronac (${err instanceof Error ? err.message : String(err)}).`,
          );
        }
      }
      if (warmId) {
        await page
          .goto(`${SALIC_BASE}/prestacao-contas/pagamento/index/idpronac/${warmId}`, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          })
          .catch(() => undefined);
      }

      const CONCURRENCY = 4;
      for (let i = 0; i < list.length; ) {
        if (Date.now() > deadline) {
          const rest = list.slice(i).map(([id]) => id);
          failedFileIds.push(...rest);
          notes.push(
            `RPA interrompido por tempo (${payments.length} pagamento(s) baixado(s), ${rest.length} pendente(s)).`,
          );
          break;
        }
        const batch = list.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(([fileId, fileName]) =>
            fetchArquivoById(page, fileId, fileName, warmId || null).then((file) => ({
              fileId,
              file,
            })),
          ),
        );
        for (const r of results) {
          if (r.file) payments.push(r.file);
          else failedFileIds.push(r.fileId);
        }
        i += batch.length;
        if (i % 20 === 0 || i >= list.length) {
          console.log(
            `  SALIC pagamentos ${i}/${list.length} (ok ${payments.length}, falha ${failedFileIds.length})`,
          );
        }
      }

      if (includeExecucao && warmId && Date.now() < deadline) {
        try {
          const execFiles = await listPronacExecucaoArquivos(page, warmId, hashHint);
          const already = new Set([
            ...payments.map((p) => p.fileId),
            ...list.map(([id]) => id),
          ]);
          let execOk = 0;
          const pending = execFiles.filter((f) => !already.has(f.fileId));
          for (let i = 0; i < pending.length; ) {
            if (Date.now() > deadline) {
              notes.push(
                `Comprovação física interrompida por tempo (${execOk} baixado(s)).`,
              );
              break;
            }
            const batch = pending.slice(i, i + CONCURRENCY);
            const results = await Promise.all(
              batch.map((f) =>
                fetchArquivoById(page, f.fileId, f.fileName, warmId).then((file) => ({
                  fileId: f.fileId,
                  file,
                })),
              ),
            );
            for (const r of results) {
              if (r.file) {
                projectDocs.push(r.file);
                already.add(r.fileId);
                execOk += 1;
              }
            }
            i += batch.length;
          }
          if (execFiles.length === 0) {
            notes.push(
              "Nenhum anexo de comprovação física/execução encontrado nas páginas do SALIC.",
            );
          } else {
            notes.push(
              `${execOk}/${execFiles.length} anexo(s) de comprovação física/execução baixados.`,
            );
          }
        } catch (err) {
          notes.push(
            `Falha ao listar comprovação física: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });
  } catch (err) {
    notes.push(
      `RPA SALIC falhou: ${err instanceof Error ? err.message : String(err)}`,
    );
    for (const [id] of list) {
      if (!payments.some((p) => p.fileId === id) && !failedFileIds.includes(id)) {
        failedFileIds.push(id);
      }
    }
  }

  if (failedFileIds.length) {
    notes.push(
      `${failedFileIds.length} arquivo(s) de pagamento não baixados do SALIC neste PRONAC.`,
    );
  }
  if (payments.length) {
    notes.push(`${payments.length} arquivo(s) de pagamento baixados do SALIC via RPA.`);
  }

  return { payments, projectDocs, failedFileIds, notes };
}
