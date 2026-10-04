import type { Page } from "playwright-core";
import { withAccountBrowser } from "@/lib/salic/crawler";
import { resolveIdPronac } from "@/lib/salic/publish-robot";
import { decryptCredential } from "@/lib/crypto";
import { prisma } from "@/lib/db";

const SALIC_BASE = "https://salic.cultura.gov.br";

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
  // rejeita HTML de erro SALIC
  const head = buf.subarray(0, 64).toString("utf8").toLowerCase();
  if (head.includes("<!doctype") || head.includes("<html") || head.includes("erro interno")) {
    return false;
  }
  return buf.length > 256;
}

/** Tenta baixar um arquivo do SALIC por idArquivo (sessão autenticada no page). */
export async function fetchArquivoById(
  page: Page,
  fileId: string,
  filenameHint?: string | null,
): Promise<SalicDownloadedFile | null> {
  const id = String(fileId || "").replace(/\D/g, "");
  if (!id) return null;

  const candidates = [
    `/file/getfile?id=${id}`,
    `/file/getfile/id/${id}`,
    `/file/index/getfile/id/${id}`,
    `/upload/download-pdf?arquivo=${id}`,
  ];

  for (const path of candidates) {
    try {
      const result = await page.evaluate(async (p) => {
        const res = await fetch(p, {
          credentials: "include",
          headers: {
            Accept: "*/*",
            Referer: `${location.origin}/prestacao-contas/pagamento/`,
          },
        });
        const buf = await res.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buf));
        return {
          ok: res.ok,
          status: res.status,
          ct: res.headers.get("content-type") || "",
          cd: res.headers.get("content-disposition") || "",
          bytes,
        };
      }, path);

      const buffer = Buffer.from(result.bytes);
      if (!result.ok || !looksBinary(buffer, result.ct)) continue;

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
        filename = `${filename}${isPdf(buffer) ? ".pdf" : ".bin"}`;
      }

      return {
        fileId: id,
        filename: filename.replace(/[^\w.\- ()]+/g, "_").slice(0, 160),
        buffer,
        mimeType: isPdf(buffer) ? "application/pdf" : result.ct || "application/octet-stream",
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
  failedFileIds: string[];
  notes: string[];
};

/**
 * Baixa comprovantes (idArquivo) do PRONAC via sessão SALIC.
 * Falhas (ex.: SALIC 500) entram em failedFileIds — não aborta o dossiê.
 */
export async function downloadPronacSalicFiles(params: {
  accountId: string;
  /** idPronac interno SALIC (numérico) quando conhecido */
  salicProjectId?: string | null;
  pronac: string;
  files: Array<{ fileId: string; fileName?: string | null }>;
  /** Limite por PRONAC (Vercel). */
  maxFiles?: number;
}): Promise<PronacSalicFilesResult> {
  const notes: string[] = [];
  const payments: SalicDownloadedFile[] = [];
  const failedFileIds: string[] = [];
  const maxFiles = params.maxFiles ?? 80;

  const unique = new Map<string, string | null | undefined>();
  for (const f of params.files) {
    const id = String(f.fileId || "").replace(/\D/g, "");
    if (id) unique.set(id, f.fileName);
  }
  const list = [...unique.entries()].slice(0, maxFiles);
  if (!list.length) {
    return { payments, failedFileIds, notes: ["Nenhum idArquivo para baixar."] };
  }

  const account = await prisma.salicAccount.findUnique({
    where: { id: params.accountId },
  });
  if (!account?.salicUsernameEnc || !account.salicPasswordEnc) {
    notes.push("Conta sem credenciais SALIC — RPA de anexos ignorado.");
    return { payments, failedFileIds: list.map(([id]) => id), notes };
  }
  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) {
    notes.push("Credenciais SALIC inválidas — RPA de anexos ignorado.");
    return { payments, failedFileIds: list.map(([id]) => id), notes };
  }

  try {
    await withAccountBrowser(account.id, username, password, async (page) => {
      let warmId = String(params.salicProjectId || "").match(/^\d+$/)?.[0] || "";
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
            timeout: 60_000,
          })
          .catch(() => undefined);
      }

      for (const [fileId, fileName] of list) {
        const file = await fetchArquivoById(page, fileId, fileName);
        if (file) payments.push(file);
        else failedFileIds.push(fileId);
      }
    });
  } catch (err) {
    notes.push(
      `RPA SALIC falhou: ${err instanceof Error ? err.message : String(err)}`,
    );
    for (const [id] of list) {
      if (!payments.some((p) => p.fileId === id)) failedFileIds.push(id);
    }
  }

  if (failedFileIds.length) {
    notes.push(
      `${failedFileIds.length} arquivo(s) não baixados do SALIC (endpoint /file/getfile pode estar indisponível).`,
    );
  }
  if (payments.length) {
    notes.push(`${payments.length} arquivo(s) baixados do SALIC via RPA.`);
  }

  return { payments, failedFileIds, notes };
}
