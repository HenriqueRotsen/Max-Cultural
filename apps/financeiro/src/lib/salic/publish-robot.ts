import { isSupabaseStoragePath } from "@/lib/storage/object-store";
import type { Page } from "playwright-core";
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
} from "@/lib/salic/session";
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

/**
 * Endereço do PDF que vai ao SALIC. Arquivo na nuvem (`sb://bucket/chave`) fica
 * como está — quem lê baixa do Storage; `path.join` estragava em `sb:/` e virava
 * um arquivo inexistente no servidor (ENOENT). Caminho local relativo vira absoluto.
 */
export function resolveProofFilePath(storagePath: string): string {
  if (isSupabaseStoragePath(storagePath) || path.isAbsolute(storagePath)) return storagePath;
  return path.join(process.cwd(), storagePath);
}

/** Imposto já lançado por guia nestes lançamentos (vai ao SALIC à parte). */
export async function launchedTaxFor(commitmentIds: string[]): Promise<number> {
  if (commitmentIds.length === 0) return 0;
  const rows = await prisma.documentRubricAllocation.findMany({
    where: {
      commitmentId: { in: [...new Set(commitmentIds)] },
      document: {
        kind: "TAX_PROOF",
        status: "IMPORTED",
        extractedJson: { path: ["taxDocType"], equals: "COMPROVANTE" },
      },
    },
    select: { amount: true, document: { select: { extractedJson: true } } },
  });
  return rows
    .filter((r) => (r.document.extractedJson as { taxSlot?: string } | null)?.taxSlot)
    .reduce((s, r) => s + Number(r.amount), 0);
}

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

  // Guia de imposto: lançamento próprio (tipo Guia de recolhimento), no valor
  // desta rubrica, com quem recebe o imposto (prefeitura ou Receita) como fornecedor.
  if (proof.kind === "TAX_PROOF") {
    const t = (proof.extractedJson ?? {}) as {
      payeeCnpj?: string | null;
      payeeName?: string | null;
      guideNumber?: string | null;
      paymentDate?: string | null;
      paymentDocumentNumber?: string | null;
    };
    if (!t.payeeCnpj) throw new Error("Guia sem o CNPJ de quem recebe o imposto. Lance a guia de novo.");
    const taxAmount = proof.grossAmount != null ? Number(proof.grossAmount) : 0;
    if (!(taxAmount > 0)) throw new Error("Valor da guia inválido para envio ao SALIC.");
    const paidOn = resolvePaymentDate({
      proofExtracted: { paymentDate: t.paymentDate ?? null },
      paidAt: proof.commitment?.paidAt,
      expectedPayAt: proof.commitment?.expectedPayAt,
    });
    return {
      accountId: project.accountId,
      proofId,
      filePath: resolveProofFilePath(mergedStoragePath),
      filename,
      payloadInput: {
        supplierCnpjCpf: t.payeeCnpj,
        supplierName: t.payeeName || "Órgão arrecadador",
        idAgente: 0,
        planilhaAprovacaoId,
        fiscalKind: null,
        mergedWithFiscal: false,
        taxGuide: true,
        documentNumber: t.guideNumber || "S/N",
        paymentDocumentNumber: resolvePaymentDocumentNumber({
          proofExtracted: { paymentDocumentNumber: t.paymentDocumentNumber ?? null },
        }),
        amount: taxAmount,
        issueDate: paidOn,
        paymentDate: paidOn,
        justificativa: justificativa?.trim() || "",
      },
    };
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
  // Sem NF/RPA: tipo e número vêm dos documentos de apoio (fatura, apólice…).
  let supportTipo: 3 | 4 | null = null;
  let supportNumber: string | null = null;
  if (!fiscal) {
    const groupIds = [
      ...new Set(
        [proof.commitmentId, ...proof.allocations.map((a) => a.commitmentId)].filter(
          (x): x is string => Boolean(x),
        ),
      ),
    ];
    const supports = groupIds.length
      ? await prisma.planningDocument.findMany({
          where: { kind: "SUPPORT", status: "IMPORTED", commitmentId: { in: groupIds } },
          select: { supportType: true, extractedJson: true },
        })
      : [];
    const { salicTipoForSupport, sortSupportDocs } = await import("@/lib/planning/support-docs");
    supportTipo = salicTipoForSupport(supports.map((d) => d.supportType));
    supportNumber =
      sortSupportDocs(supports)
        .map((d) => (d.extractedJson as { documentNumber?: string | null } | null)?.documentNumber)
        .find(Boolean) ?? null;
  }
  const docNumber = fiscal
    ? resolveFiscalDocumentNumber(fiscalExtracted, fiscalKind)
    : supportNumber || resolveFiscalDocumentNumber(fiscalExtracted, fiscalKind);
  const paymentDoc = resolvePaymentDocumentNumber({
    proofExtracted,
    fiscalExtracted,
  });

  const grossSent =
    proof.grossAmount != null
      ? Number(proof.grossAmount)
      : proof.commitment
        ? Number(proof.commitment.amount)
        : fiscal?.grossAmount != null
          ? Number(fiscal.grossAmount)
          : 0;

  // Imposto retido já lançado por guia vai em lançamento próprio: a NF vai
  // pelo líquido (o que saiu para o fornecedor).
  const taxCommitments =
    proof.grossAmount != null
      ? [
          proof.commitmentId,
          // Todas as rubricas do comprovante (a consulta acima traz só a maior).
          ...(
            await prisma.documentRubricAllocation.findMany({
              where: { documentId: proof.id },
              select: { commitmentId: true },
            })
          ).map((x) => x.commitmentId),
        ]
      : [proof.commitmentId];
  const launchedTax = await launchedTaxFor(
    taxCommitments.filter((x): x is string => Boolean(x)),
  );
  const amount = Math.round((grossSent - launchedTax) * 100) / 100;

  if (!(amount > 0)) {
    throw new Error("Valor do comprovante inválido para envio ao SALIC.");
  }

  return {
    accountId: project.accountId,
    proofId,
    filePath: resolveProofFilePath(mergedStoragePath),
    filename,
    payloadInput: {
      supplierCnpjCpf: supplier.cnpj,
      supplierName: supplier.name,
      idAgente: 0,
      planilhaAprovacaoId,
      fiscalKind,
      mergedWithFiscal: Boolean(fiscal),
      supportTipo,
      documentNumber: docNumber,
      paymentDocumentNumber: paymentDoc,
      amount,
      issueDate,
      paymentDate,
      justificativa: withFineJustification(justificativa, proof.extractedJson),
    },
  };
}

/**
 * Comprovante pago com multa/juros: vai ao SALIC no valor do comprovante, com a
 * justificativa da diferença (devolvida pelo proponente) antes da escrita pela pessoa.
 */
export function withFineJustification(justificativa: string | undefined, extractedJson: unknown): string {
  const typed = justificativa?.trim() || "";
  const fine = Number(
    (extractedJson as { paymentReview?: { fineAmount?: number } } | null)?.paymentReview?.fineAmount ?? 0,
  );
  if (!(fine > 0)) return typed;
  const brl = fine.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const note = `Pagamento com multa/juros por atraso de ${brl}, não custeados pelo projeto: valor devolvido pelo proponente.`;
  return typed.includes(note) ? typed : [note, typed].filter(Boolean).join(" ");
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
    items.push(...(await fetchSalicRelacaoPagamentosOnPage(page, idPronac)));
  });

  return items;
}

/** Relação de pagamentos do PRONAC, numa página já autenticada no SALIC. */
export async function fetchSalicRelacaoPagamentosOnPage(
  page: Page,
  idPronac: number,
): Promise<SalicRelacaoPagamento[]> {
  const rows = await loadSalicRelacaoPagamentoRows(page, idPronac);
  const items: SalicRelacaoPagamento[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const mapped = mapSalicRelacaoRow(row);
    if (!mapped || seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    items.push(mapped);
  }
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
