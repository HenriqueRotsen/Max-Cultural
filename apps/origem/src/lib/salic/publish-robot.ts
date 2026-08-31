import type { Page } from "playwright";
import path from "path";
import { prisma } from "@/lib/db";
import { decryptCredential, normalizeCgccpf } from "@/lib/crypto";
import { readPlanningDocumentBytes } from "@/lib/nf/read-document-bytes";
import { ensureFiscalDocumentNumber } from "@/lib/nf/ensure-fiscal-number";
import {
  extractProofFromBuffer,
} from "@/lib/nf/extract";
import {
  resolveFiscalDocumentNumber,
  resolveIssueDate,
  resolvePaymentDate,
  resolvePaymentDocumentNumber,
} from "@/lib/salic/salic-publish-metadata";
import {
  waitPastCloudflare,
  withAccountBrowser,
  listProponentesUi,
  listProjectsUi,
} from "@/lib/salic/crawler";
import {
  buildSalicComprovantePayload,
  type SalicComprovantePayload,
} from "@/lib/salic/salic-publish-payload";

const SALIC_BASE = "https://salic.cultura.gov.br";

type SalicJsonResponse = {
  success?: boolean;
  idComprovantePagamento?: number | string;
  message?: string;
  retorno?: boolean;
  idAgente?: number | string;
  nome?: string;
};

type PageFetchResult = { ok: boolean; status: number; text: string };

function cloudflareBlocked(text: string): boolean {
  return /just a moment|checking your browser|enable javascript and cookies|cloudflare/i.test(
    text,
  );
}

function parseSalicJsonBody(result: PageFetchResult): SalicJsonResponse {
  if (cloudflareBlocked(result.text)) {
    throw new Error(
      "O SALIC bloqueou a requisição (proteção Cloudflare). Aguarde um minuto e tente novamente.",
    );
  }

  let json: SalicJsonResponse = {};
  try {
    json = JSON.parse(result.text) as SalicJsonResponse;
  } catch {
    throw new Error(
      `Resposta inválida do SALIC (HTTP ${result.status}): ${result.text.slice(0, 200)}`,
    );
  }

  if (!result.ok) {
    throw new Error(json.message || `HTTP ${result.status} do SALIC: ${result.text.slice(0, 200)}`);
  }

  return json;
}

/** fetch autenticado no contexto do navegador (cookies + Cloudflare). */
async function salicFetchInPage(
  page: Page,
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<PageFetchResult> {
  const fullUrl = url.startsWith("http") ? url : `${SALIC_BASE}${url}`;
  return page.evaluate(
    async ({ fullUrl, init }) => {
      const res = await fetch(fullUrl, {
        method: init?.method ?? "GET",
        credentials: "include",
        headers: init?.headers,
        body: init?.body,
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    },
    { fullUrl, init },
  );
}

async function salicPostMultipartInPage(
  page: Page,
  url: string,
  fields: { comprovanteJson: string; fileBase64: string; filename: string },
): Promise<PageFetchResult> {
  const fullUrl = url.startsWith("http") ? url : `${SALIC_BASE}${url}`;
  return page.evaluate(
    async ({ fullUrl, fields }) => {
      const form = new FormData();
      form.append("comprovante", fields.comprovanteJson);
      const binary = atob(fields.fileBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const name = fields.filename.endsWith(".pdf")
        ? fields.filename
        : `${fields.filename}.pdf`;
      form.append(
        "arquivo",
        new Blob([bytes], { type: "application/pdf" }),
        name,
      );
      const res = await fetch(fullUrl, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    },
    { fullUrl, fields },
  );
}

async function loadAccountCredentials(accountId: string) {
  const account = await prisma.salicAccount.findUniqueOrThrow({
    where: { id: accountId },
  });
  if (!account.salicUsernameEnc || !account.salicPasswordEnc) {
    throw new Error("Conta sem usuário e senha do SALIC na área logada.");
  }
  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) {
    throw new Error("Credenciais SALIC inválidas.");
  }
  return { account, username, password };
}

export async function resolveIdPronac(
  page: Page,
  accountCgccpf: string,
  externalCode: string,
): Promise<number> {
  const wantCnpj = normalizeCgccpf(accountCgccpf);
  const proponentes = await listProponentesUi(page);
  const match =
    proponentes.find((p) => normalizeCgccpf(p.CPF) === wantCnpj) ||
    proponentes.find((p) => normalizeCgccpf(p.Nome) === wantCnpj);
  if (!match) {
    throw new Error(
      `Proponente ${wantCnpj} não encontrado entre os proponentes deste login SALIC.`,
    );
  }

  const projects = await listProjectsUi(page, match.idAgenteProponente);
  const project = projects.find((p) => String(p.Pronac) === String(externalCode));
  if (!project?.IdPRONAC) {
    throw new Error(
      `PRONAC ${externalCode} não encontrado na área logada do proponente ${match.Nome}.`,
    );
  }
  return project.IdPRONAC;
}

/** Abre a área de prestação de contas do PRONAC (cookies Cloudflare para REST gerenciar). */
async function openPrestacaoContasPage(page: Page, idPronac: number) {
  await page.goto(`${SALIC_BASE}/prestacao-contas/pagamento/index/idpronac/${idPronac}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await waitPastCloudflare(page).catch(() => undefined);
  await page.waitForTimeout(800);
}

export async function lookupSalicFornecedorAgente(
  page: Page,
  cnpjCpf: string,
): Promise<{ idAgente: string | number; nome: string }> {
  const doc = normalizeCgccpf(cnpjCpf);
  const url = `/prestacao-contas/gerenciar/fornecedor?cnpjcpf=${encodeURIComponent(doc)}`;
  const result = await salicFetchInPage(page, url);
  const json = parseSalicJsonBody(result);
  if (!json.retorno || json.idAgente == null) {
    throw new Error(
      `Fornecedor ${doc} não cadastrado no SALIC. Cadastre-o na Relação de Pagamentos antes do envio automático.`,
    );
  }
  return { idAgente: json.idAgente, nome: json.nome || "Fornecedor" };
}

export async function deleteSalicComprovanteOnPage(
  page: Page,
  salicComprovanteId: string,
): Promise<void> {
  const body = new URLSearchParams();
  body.set("comprovante[idComprovantePagamento]", salicComprovanteId);

  const result = await salicFetchInPage(page, "/prestacao-contas/gerenciar/excluir", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = parseSalicJsonBody(result);
  if (json.success === false) {
    throw new Error(json.message || "Falha ao excluir comprovante no SALIC.");
  }
}

export async function uploadSalicComprovanteOnPage(
  page: Page,
  payload: SalicComprovantePayload,
  file: { buffer: Buffer; filename: string },
  mode: "create" | "update",
): Promise<string> {
  const endpoint =
    mode === "update"
      ? "/prestacao-contas/gerenciar/atualizar"
      : "/prestacao-contas/gerenciar/cadastrar";

  const result = await salicPostMultipartInPage(page, endpoint, {
    comprovanteJson: JSON.stringify(payload),
    fileBase64: file.buffer.toString("base64"),
    filename: file.filename,
  });

  const json = parseSalicJsonBody(result);
  if (json.success === false) {
    throw new Error(json.message || "Falha ao enviar comprovante ao SALIC.");
  }
  const id = json.idComprovantePagamento;
  if (id == null) {
    throw new Error("SALIC não retornou idComprovantePagamento após o envio.");
  }
  return String(id);
}

type ProofPublishContext = {
  accountId: string;
  proofId: string;
  filePath: string;
  filename: string;
};

async function loadProofPublishContext(
  planningProjectId: string,
  proofId: string,
  mergedStoragePath: string,
  filename: string,
  justificativa?: string,
): Promise<ProofPublishContext & { payloadInput: Parameters<typeof buildSalicComprovantePayload>[0] }> {
  const project = await prisma.planningProject.findUniqueOrThrow({
    where: { id: planningProjectId },
    select: { accountId: true, externalCode: true },
  });

  const proof = await prisma.planningDocument.findUniqueOrThrow({
    where: { id: proofId },
    include: {
      commitment: {
        include: {
          engagement: {
            include: {
              service: {
                include: { supplier: { select: { name: true, cnpj: true } } },
              },
            },
          },
        },
      },
      engagement: {
        include: {
          service: {
            include: { supplier: { select: { name: true, cnpj: true } } },
          },
        },
      },
      sourceDocument: {
        select: {
          id: true,
          kind: true,
          filename: true,
          mimeType: true,
          storagePath: true,
          extractedJson: true,
          grossAmount: true,
        },
      },
      allocations: {
        include: {
          budgetLine: { select: { planilhaAprovacaoId: true, sortOrder: true } },
        },
        orderBy: { amount: "desc" },
        take: 1,
      },
    },
  });

  const planilhaAprovacaoId = proof.allocations[0]?.budgetLine.planilhaAprovacaoId;
  if (!planilhaAprovacaoId) {
    throw new Error(
      "Comprovante sem rubrica vinculada (planilhaAprovacaoId). Confirme o rateio antes do envio ao SALIC.",
    );
  }

  const supplier =
    proof.commitment?.engagement.service.supplier ??
    proof.engagement?.service.supplier ??
    (() => {
      throw new Error("Comprovante sem fornecedor vinculado.");
    })();

  const fiscal = proof.sourceDocument;
  const fiscalKind =
    fiscal?.kind === "NF" || fiscal?.kind === "RPA" ? fiscal.kind : null;

  let fiscalExtracted = (fiscal?.extractedJson || {}) as {
    nfNumber?: string;
    invoiceNumber?: string;
    hiredAt?: string;
    payment?: { pixKey?: string | null; bankAccount?: string | null } | null;
  };

  if (
    fiscal &&
    resolveFiscalDocumentNumber(fiscalExtracted, fiscalKind) === "S/N"
  ) {
    const ensured = await ensureFiscalDocumentNumber(fiscal);
    if (ensured) {
      fiscalExtracted = {
        ...fiscalExtracted,
        nfNumber: ensured,
        invoiceNumber: ensured,
      };
    }
  }

  let proofExtracted = (proof.extractedJson || {}) as {
    paymentDate?: string | null;
    paymentDocumentNumber?: string | null;
  };

  if (!proofExtracted.paymentDate && !proofExtracted.paymentDocumentNumber) {
    try {
      const buffer = await readPlanningDocumentBytes(proof.storagePath);
      const refreshed = await extractProofFromBuffer({
        buffer,
        filename: proof.filename,
        mimeType: proof.mimeType,
      });
      proofExtracted = { ...proofExtracted, ...refreshed };
    } catch {
      // mantém extração salva
    }
  }

  const paymentDate = resolvePaymentDate({
    proofExtracted,
    paidAt: proof.commitment?.paidAt,
    expectedPayAt: proof.commitment?.expectedPayAt,
  });
  const issueDate = resolveIssueDate({ fiscalExtracted, paymentDate });
  const docNumber = resolveFiscalDocumentNumber(fiscalExtracted, fiscalKind);
  const paymentDoc = resolvePaymentDocumentNumber({
    proofExtracted,
    fiscalExtracted,
  });

  const amount =
    proof.grossAmount != null
      ? Number(proof.grossAmount)
      : proof.commitment
        ? Number(proof.commitment.amount)
        : fiscal?.grossAmount != null
          ? Number(fiscal.grossAmount)
          : 0;

  if (!(amount > 0)) {
    throw new Error("Valor do comprovante inválido para envio ao SALIC.");
  }

  return {
    accountId: project.accountId,
    proofId,
    filePath: path.isAbsolute(mergedStoragePath)
      ? mergedStoragePath
      : path.join(process.cwd(), mergedStoragePath),
    filename,
    payloadInput: {
      supplierCnpjCpf: supplier.cnpj,
      supplierName: supplier.name,
      idAgente: 0,
      planilhaAprovacaoId,
      fiscalKind,
      mergedWithFiscal: Boolean(fiscal),
      documentNumber: docNumber,
      paymentDocumentNumber: paymentDoc,
      amount,
      issueDate,
      paymentDate,
      justificativa: justificativa?.trim() || "",
    },
  };
}

export async function runSalicPublishForProof(params: {
  planningProjectId: string;
  externalCode: string;
  proofId: string;
  mergedStoragePath: string;
  filename: string;
  replaceSalicId?: string | null;
  justificativa?: string;
}): Promise<{ salicComprovanteId: string }> {
  const ctx = await loadProofPublishContext(
    params.planningProjectId,
    params.proofId,
    params.mergedStoragePath,
    params.filename,
    params.justificativa,
  );

  const { account, username, password } = await loadAccountCredentials(ctx.accountId);
  const fileBuffer = await readPlanningDocumentBytes(ctx.filePath);

  let resultId = "";

  await withAccountBrowser(account.id, username, password, async (page) => {
    const idPronac = await resolveIdPronac(page, account.cgccpf, params.externalCode);
    await openPrestacaoContasPage(page, idPronac);

    const fornecedor = await lookupSalicFornecedorAgente(
      page,
      ctx.payloadInput.supplierCnpjCpf,
    );
    ctx.payloadInput.idAgente = fornecedor.idAgente;
    ctx.payloadInput.supplierName = fornecedor.nome || ctx.payloadInput.supplierName;

    if (params.replaceSalicId) {
      await deleteSalicComprovanteOnPage(page, params.replaceSalicId);
    }

    const payload = buildSalicComprovantePayload(ctx.payloadInput);
    resultId = await uploadSalicComprovanteOnPage(
      page,
      payload,
      { buffer: fileBuffer, filename: ctx.filename },
      "create",
    );
  });

  return { salicComprovanteId: resultId };
}

export async function runSalicDeleteComprovante(params: {
  planningProjectId: string;
  externalCode: string;
  salicComprovanteId: string;
}): Promise<void> {
  const project = await prisma.planningProject.findUniqueOrThrow({
    where: { id: params.planningProjectId },
    select: { accountId: true },
  });
  const { account, username, password } = await loadAccountCredentials(project.accountId);

  await withAccountBrowser(account.id, username, password, async (page) => {
    const idPronac = await resolveIdPronac(page, account.cgccpf, params.externalCode);
    await openPrestacaoContasPage(page, idPronac);
    await deleteSalicComprovanteOnPage(page, params.salicComprovanteId);
  });
}

type SalicRelacaoPagamentoRow = {
  idComprovantePagamento?: number;
  idPlanilhaAprovacao?: number;
  Fornecedor?: string;
  CNPJCPF?: string;
  vlPagamento?: number;
  DtPagamento?: string;
  nrComprovante?: string;
  Item?: string;
};

export type SalicRelacaoPagamento = {
  id: string;
  planilhaAprovacaoId: string | null;
  supplierName: string;
  supplierDoc: string;
  amount: number;
  paymentDate: string | null;
  proofNumber: string | null;
  rubricItem: string | null;
};

function mapSalicRelacaoRow(row: SalicRelacaoPagamentoRow): SalicRelacaoPagamento | null {
  if (row.idComprovantePagamento == null) return null;
  return {
    id: String(row.idComprovantePagamento),
    planilhaAprovacaoId:
      row.idPlanilhaAprovacao != null ? String(row.idPlanilhaAprovacao) : null,
    supplierName: row.Fornecedor?.trim() || "Fornecedor",
    supplierDoc: row.CNPJCPF?.trim() || "",
    amount: row.vlPagamento ?? 0,
    paymentDate: row.DtPagamento?.trim() || null,
    proofNumber: row.nrComprovante?.trim() || null,
    rubricItem: row.Item?.trim() || null,
  };
}

async function loadSalicRelacaoPagamentoRows(
  page: Page,
  idPronac: number,
): Promise<SalicRelacaoPagamentoRow[]> {
  const result = await salicFetchInPage(
    page,
    `/prestacao-contas/relacao-pagamento-rest/index?idPronac=${idPronac}`,
  );

  if (cloudflareBlocked(result.text)) {
    throw new Error(
      "O SALIC bloqueou a consulta (proteção Cloudflare). Aguarde um minuto e tente novamente.",
    );
  }

  let json: { data?: { items?: SalicRelacaoPagamentoRow[] } };
  try {
    json = JSON.parse(result.text) as { data?: { items?: SalicRelacaoPagamentoRow[] } };
  } catch {
    throw new Error(
      `Resposta inválida do SALIC ao listar comprovantes (HTTP ${result.status}).`,
    );
  }

  if (!result.ok) {
    throw new Error(
      `Falha ao listar comprovantes no SALIC (HTTP ${result.status}): ${result.text.slice(0, 200)}`,
    );
  }

  return json.data?.items ?? [];
}

/** Lista comprovantes de pagamento existentes no SALIC para o PRONAC. */
export async function fetchSalicRelacaoPagamentos(params: {
  planningProjectId: string;
  externalCode: string;
}): Promise<SalicRelacaoPagamento[]> {
  const project = await prisma.planningProject.findUniqueOrThrow({
    where: { id: params.planningProjectId },
    select: { accountId: true },
  });
  const { account, username, password } = await loadAccountCredentials(project.accountId);

  const items: SalicRelacaoPagamento[] = [];

  await withAccountBrowser(account.id, username, password, async (page) => {
    const idPronac = await resolveIdPronac(page, account.cgccpf, params.externalCode);
    await openPrestacaoContasPage(page, idPronac);
    const rows = await loadSalicRelacaoPagamentoRows(page, idPronac);
    const seen = new Set<string>();
    for (const row of rows) {
      const mapped = mapSalicRelacaoRow(row);
      if (!mapped || seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      items.push(mapped);
    }
  });

  return items;
}

/** Lista ids de comprovantes de pagamento existentes no SALIC para o PRONAC. */
export async function fetchSalicComprovanteIds(params: {
  planningProjectId: string;
  externalCode: string;
}): Promise<Set<string>> {
  const items = await fetchSalicRelacaoPagamentos(params);
  return new Set(items.map((item) => item.id));
}
