"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { normalizeCgccpf, parseBrMoney } from "@/lib/format";
import { canDeleteNf, canExceedRubric, canPublishToSalic, canReadequacao } from "@/lib/planning/acl";
import {
  assessSalicPublishReadiness,
  classifyLifecycleFromSituacao,
} from "@/lib/planning/lifecycle";
import { listPlanningRulesets } from "@/lib/planning/rulesets";
import {
  provisionFluxoProjeto,
  resolveFluxoContexto,
  listFluxoContextos,
  type FluxoContextoOption,
  type FluxoContextResolve,
} from "@/lib/fluxo/provision-projeto";
import {
  fetchHomologatedLinesFromSalic,
  fetchReadequadaLinesFromSalic,
  fetchSalicProjectPreview,
  HomologadaImportError,
  linkHomologatedSheetsForOpenProjects,
  persistHomologatedSheet,
} from "@/lib/planning/import-homologada";
import {
  applyCaptacaoToPlanningProject,
  CaptacaoImportError,
  fetchCaptacaoFromSalic,
  syncCaptacaoForWorkspace,
} from "@/lib/planning/captacao-salic";
import { parseStateHomologatedFile } from "@/lib/planning/state-file";
import {
  canReserveAmount,
  computeProjectBalance,
  isAdminProduct,
} from "@/lib/planning/rubric-balance";
import { fifthBusinessDayNextMonth } from "@/lib/planning/business-days";
import {
  parseReminderDate,
} from "@/lib/planning/reminder-dates";
import {
  taxDueSummaryFromCompetence,
} from "@/lib/planning/tax-due-dates";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { sendNotificationEmail } from "@/lib/planning/notify-email";
import { extractNfFromBuffer, extractProofFromBuffer, scaleTaxes, taxTotalOf } from "@/lib/nf/extract";
import type { ExtractedTaxes } from "@/lib/nf/extract";
import {
  checkPaymentAmount,
  checkProjectCodeInDocument,
  checkTaxProofAgainstNf,
  mergeWarnings,
} from "@/lib/nf/document-cross-check";
import { storeCompressedDocument } from "@/lib/nf/compress";
import {
  DuplicateDocumentError,
  findFiscalDocumentDuplicate,
  persistPlanningUpload,
} from "@/lib/nf/persist-upload";
import { buildPlanningDocumentFilename } from "@/lib/nf/document-filename";
import {
  extractPaymentDetails,
  mergePaymentDetails,
} from "@/lib/nf/payment-details";
import { lookupCnpj } from "@/lib/catalog/brasil-api";
import { normalizeCnaeCode } from "@/lib/catalog/cnae";
import { evaluateSupplierLimit } from "@/lib/compliance/rouanet";
import { toActiveRules } from "@/lib/compliance/rules";
import {
  READEQUACAO_TTL_MS,
  budgetLineIdentityKey,
  exportReadequacaoCsv,
  snapshotFromProject,
  validateReadequacaoSnapshot,
  type ReadequacaoSnapshot,
  moneyN,
} from "@/lib/planning/readequacao";

export type { ActionState } from "@/lib/planning/action-state";
import type { ActionState } from "@/lib/planning/action-state";

function revalidatePlanning(id?: string) {
  revalidatePath("/planejamento");
  revalidatePath("/planejamento/buscar");
  revalidatePath("/fornecedores");
  revalidatePath("/fornecedores/contratacoes");
  if (id) {
    revalidatePath(`/planejamento/${id}`);
    revalidatePath(`/planejamento/${id}/nf/nova`);
    revalidatePath(`/planejamento/${id}/reservas`);
    revalidatePath(`/planejamento/${id}/importar-produtor`);
  }
}

/** Espelha no Fluxo (não bloqueia o Origem). Retorna erro para exibir na UI. */
async function syncFluxoProjeto(params: {
  pronac: string;
  nome: string;
  proponente?: string;
  fluxoContextMode?: string;
  fluxoContextoId?: string;
  fluxoContextoNome?: string;
  autoMatchContexto?: boolean;
  /** Importação em lote: cria contexto se não houver match; falhas só logam. */
  bulk?: boolean;
}): Promise<string | null> {
  const mode = params.fluxoContextMode || "auto";
  const result = await provisionFluxoProjeto({
    pronac: params.pronac,
    nome: params.nome,
    proponente: params.proponente,
    contextoId: mode === "link" ? params.fluxoContextoId : undefined,
    contextoNome: mode === "create" ? params.fluxoContextoNome : undefined,
    createContexto: mode === "create" || Boolean(params.bulk),
    autoMatchContexto: mode === "auto" || Boolean(params.bulk),
  });
  if (!result.ok) {
    if (params.bulk) {
      console.warn("[planning→fluxo]", result.error);
      return null;
    }
    return result.error;
  }
  return null;
}

function readFluxoContextFromForm(formData: FormData) {
  return {
    fluxoContextMode: String(formData.get("fluxoContextMode") || "auto"),
    fluxoContextoId: String(formData.get("fluxoContextoId") || "").trim(),
    fluxoContextoNome: String(formData.get("fluxoContextoNome") || "").trim(),
  };
}

export type { FluxoContextResolve } from "@/lib/fluxo/provision-projeto";

export async function previewPlanningProjectContext(
  accountId: string,
  pronac: string,
  projectNameHint?: string,
): Promise<
  | {
      ok: true;
      projectName: string;
      resolve: FluxoContextResolve;
    }
  | { ok: false; error: string }
> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const code = pronac.trim();
  if (!code) return { ok: false, error: "Informe o código do projeto" };

  let projectName = projectNameHint?.trim() || code;

  if (accountId) {
    const account = await prisma.salicAccount.findFirst({
      where: { id: accountId, workspaceId: entitlements.workspaceId },
    });
    if (!account) return { ok: false, error: "Proponente inválido" };
    try {
      const preview = await fetchSalicProjectPreview({
        accountId,
        pronac: code,
      });
      if (preview.projectName) projectName = preview.projectName;
    } catch (e) {
      const msg =
        e instanceof HomologadaImportError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Falha ao consultar SALIC";
      return { ok: false, error: msg };
    }
  }

  const resolve = await resolveFluxoContexto(projectName);
  if (!resolve) {
    return { ok: false, error: "Não foi possível consultar contextos no Fluxo." };
  }

  return { ok: true, projectName, resolve };
}

export async function listFluxoContextosAction(
  q?: string,
): Promise<FluxoContextoOption[]> {
  await requireUser();
  return listFluxoContextos(q);
}

export async function startPlanningProjectFederal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "");
  const externalCode = String(formData.get("externalCode") || "").trim();
  const rulesetVersion = String(formData.get("rulesetVersion") || "").trim();

  if (!accountId || !externalCode || !rulesetVersion) {
    return { error: "Preencha proponente, PRONAC e norma" };
  }

  const account = await prisma.salicAccount.findFirst({
    where: { id: accountId, workspaceId: entitlements.workspaceId },
  });
  if (!account) return { error: "Proponente inválido" };

  const existing = await prisma.planningProject.findUnique({
    where: {
      workspaceId_accountId_externalCode: {
        workspaceId: entitlements.workspaceId,
        accountId,
        externalCode,
      },
    },
  });
  if (existing?.importedAt) {
    return { error: "Este PRONAC já foi iniciado neste proponente" };
  }

  let fetched;
  try {
    fetched = await fetchHomologatedLinesFromSalic({
      accountId,
      pronac: externalCode,
    });
  } catch (e) {
    const msg =
      e instanceof HomologadaImportError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Falha ao importar planilha homologada";
    return { error: msg };
  }

  const auditProject = await prisma.project.upsert({
    where: {
      salicAccountId_pronac: { salicAccountId: accountId, pronac: externalCode },
    },
    create: {
      salicAccountId: accountId,
      pronac: externalCode,
      name: fetched.projectName,
      salicProjectId: fetched.idPronacHash,
    },
    update: {
      name: fetched.projectName || undefined,
      salicProjectId: fetched.idPronacHash || undefined,
    },
  });

  const project =
    existing ||
    (await prisma.planningProject.create({
      data: {
        workspaceId: entitlements.workspaceId,
        accountId,
        jurisdiction: "FEDERAL",
        rulesetVersion,
        externalCode,
        name: fetched.projectName,
        projectId: auditProject.id,
        lifecycleStatus: auditProject.lifecycleStatus || "EM_ANDAMENTO",
      },
    }));

  if (existing) {
    await prisma.planningProject.update({
      where: { id: existing.id },
      data: {
        name: fetched.projectName,
        projectId: auditProject.id,
        rulesetVersion,
      },
    });
  }

  await persistHomologatedSheet({
    planningProjectId: project.id,
    lines: fetched.lines,
    totalApproved: fetched.totalApproved,
    importSource: "SALIC_HOMOLOGADA",
  });

  if (fetched.captacao) {
    await applyCaptacaoToPlanningProject({
      planningProjectId: project.id,
      captacao: fetched.captacao,
    });
  }

  const fluxoErr = await syncFluxoProjeto({
    pronac: externalCode,
    nome: fetched.projectName || externalCode,
    proponente: account.name,
    ...readFluxoContextFromForm(formData),
  });
  if (fluxoErr) return { error: fluxoErr };

  revalidatePlanning(project.id);
  redirect(`/planejamento/${project.id}`);
}

export async function startPlanningProjectState(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "");
  const externalCode = String(formData.get("externalCode") || "").trim();
  const rulesetVersion = String(formData.get("rulesetVersion") || "").trim();
  const jurisdiction = String(formData.get("jurisdiction") || "").trim();
  const file = formData.get("sheetFile");

  if (!accountId || !externalCode || !rulesetVersion || !jurisdiction) {
    return { error: "Preencha UF, proponente, código e norma" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Envie o arquivo da planilha homologada" };
  }

  const account = await prisma.salicAccount.findFirst({
    where: { id: accountId, workspaceId: entitlements.workspaceId },
  });
  if (!account) return { error: "Proponente inválido" };

  const existing = await prisma.planningProject.findUnique({
    where: {
      workspaceId_accountId_externalCode: {
        workspaceId: entitlements.workspaceId,
        accountId,
        externalCode,
      },
    },
  });
  if (existing?.importedAt) {
    return { error: "Este código já foi iniciado neste proponente" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseStateHomologatedFile(buffer, file.name);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao ler a planilha",
    };
  }

  const project =
    existing ||
    (await prisma.planningProject.create({
      data: {
        workspaceId: entitlements.workspaceId,
        accountId,
        jurisdiction,
        rulesetVersion,
        externalCode,
        name: externalCode,
      },
    }));

  if (existing) {
    await prisma.planningProject.update({
      where: { id: existing.id },
      data: { rulesetVersion, jurisdiction },
    });
  }

  await persistHomologatedSheet({
    planningProjectId: project.id,
    lines: parsed.lines,
    totalApproved: parsed.totalApproved,
    sourceFilename: file.name,
    importSource: "STATE_FILE",
  });

  const fluxoErr = await syncFluxoProjeto({
    pronac: externalCode,
    nome: project.name || externalCode,
    proponente: account.name,
    ...readFluxoContextFromForm(formData),
  });
  if (fluxoErr) return { error: fluxoErr };

  revalidatePlanning(project.id);
  redirect(`/planejamento/${project.id}`);
}

export async function updatePlanningCaptacao(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
  });
  if (!project) return { error: "Projeto não encontrado" };

  const parseMoneyField = (key: string) => {
    const raw = String(formData.get(key) || "").trim();
    if (!raw) return null;
    const n = Number(raw.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return NaN;
    return n;
  };

  // Recebido/Transferido/Captado vêm do SALIC; aqui só editamos rendimentos.
  const rendimentos = parseMoneyField("rendimentos");
  if (rendimentos != null && Number.isNaN(rendimentos)) {
    return { error: "Valor de rendimentos inválido" };
  }

  await prisma.planningProject.update({
    where: { id: planningProjectId },
    data: { rendimentos },
  });
  revalidatePlanning(planningProjectId);
  return { ok: true };
}

export async function refreshPlanningCaptacaoFromSalic(
  planningProjectId: string,
  _prev: ActionState = {},
  _formData?: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
  });
  if (!project) return { error: "Projeto não encontrado" };
  if (project.jurisdiction !== "FEDERAL") {
    return { error: "Captação automática disponível só para projetos federais (SALIC)" };
  }

  try {
    const captacao = await fetchCaptacaoFromSalic({
      accountId: project.accountId,
      pronac: project.externalCode,
    });
    await applyCaptacaoToPlanningProject({
      planningProjectId: project.id,
      captacao,
    });
  } catch (e) {
    const msg =
      e instanceof CaptacaoImportError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Falha ao carregar captação do SALIC";
    return { error: msg };
  }

  revalidatePlanning(planningProjectId);
  return { ok: true };
}

/** Atualiza Captação de recursos de todos os projetos federais do workspace. */
export async function refreshAllPlanningCaptacaoFromSalic(): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  try {
    const result = await syncCaptacaoForWorkspace(entitlements.workspaceId);
    revalidatePlanning();
    if (result.synced === 0 && result.errors.length > 0) {
      return {
        error: `Nenhum projeto atualizado. ${result.errors.slice(0, 3).join(" · ")}`,
      };
    }
    return {
      ok: true,
      message: `Captação atualizada em ${result.synced} projeto(s)${
        result.skipped ? ` · ${result.skipped} ignorado(s)` : ""
      }.`,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao sincronizar captação",
    };
  }
}

export async function uploadNfForReview(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const file = formData.get("nfFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione a NF ou RPA (PDF ou XML)" };
  }

  const kindRaw = String(formData.get("documentKind") || "").toUpperCase();
  const forcedKind: "NF" | "RPA" | null =
    kindRaw === "RPA" ? "RPA" : kindRaw === "NF" ? "NF" : null;
  if (!forcedKind) {
    return { error: "Informe se o documento é NF ou RPA" };
  }

  const attachCommitmentId = String(
    formData.get("attachCommitmentId") || "",
  ).trim();

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
  });
  if (!project?.importedAt) return { error: "Projeto sem planilha importada" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractNfFromBuffer({
    buffer,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
  });

  const kind = forcedKind;
  const personType =
    extracted.personType ||
    (kind === "RPA" ? "PF" : "PJ");
  const gross = extracted.grossAmount ?? extracted.totalPrice ?? null;
  const taxTotal = extracted.taxTotal ?? (taxTotalOf(extracted.taxes) || null);

  const displayName = buildPlanningDocumentFilename({
    kind,
    projectCode: project.externalCode,
    supplierName: extracted.supplierName,
    supplierDoc: extracted.cnpj,
    hiredAt: extracted.hiredAt,
    amount: gross,
    originalFilename: file.name,
    mimeType: file.type || "application/octet-stream",
  });

  let stored;
  try {
    stored = await persistPlanningUpload({
      buffer,
      filename: displayName,
      mimeType: file.type || "application/octet-stream",
      workspaceId: entitlements.workspaceId,
      rejectDuplicate: {
        planningProjectId,
        kinds: ["NF", "RPA"],
      },
    });
  } catch (e) {
    if (e instanceof DuplicateDocumentError) {
      const d = e.duplicate;
      if (
        d.planningProjectId === planningProjectId &&
        d.status === "REVIEW"
      ) {
        return {
          error:
            "Este arquivo já foi enviado e aguarda revisão. Continue a revisão em vez de reenviar o mesmo PDF.",
          href: `/planejamento/${planningProjectId}/nf/${d.id}/revisar`,
        };
      }
      if (
        d.planningProjectId === planningProjectId &&
        d.status === "IMPORTED"
      ) {
        return {
          error: `Esta nota já foi reservada (${d.filename}). Exclua a NF antes de reenviar o mesmo arquivo.`,
        };
      }
      return { error: e.message.slice("DUPLICATE:".length) };
    }
    throw e;
  }

  const fiscalDup = await findFiscalDocumentDuplicate({
    workspaceId: entitlements.workspaceId,
    planningProjectId,
    cnpj: normalizeCgccpf(extracted.cnpj || ""),
    nfNumber:
      (extracted as { nfNumber?: string; invoiceNumber?: string }).nfNumber ||
      (extracted as { invoiceNumber?: string }).invoiceNumber,
    grossAmount: gross ?? 0,
  });
  if (fiscalDup) {
    return {
      error: `Possível duplicata: já existe ${fiscalDup.filename} com mesmo fornecedor, número e valor.`,
    };
  }

  const projectCheck = checkProjectCodeInDocument({
    text: [
      extracted.rawText,
      extracted.serviceDescription,
      extracted.items?.map((i) => i.name).join("\n"),
    ]
      .filter(Boolean)
      .join("\n"),
    expectedCode: project.externalCode,
    extractedPronac: extracted.pronac,
  });
  const docWarnings = mergeWarnings(projectCheck.warning);
  const extractionNote =
    extracted.extractOk === false
      ? extracted.notes || "Extração incompleta — revise os campos"
      : null;
  const combinedNotice = mergeWarnings(extractionNote, ...docWarnings).join(
    " · ",
  );

  const doc = await prisma.planningDocument.create({
    data: {
      kind,
      status: "REVIEW",
      filename: displayName,
      mimeType: file.type || "application/octet-stream",
      storagePath: stored.storagePath,
      byteSize: stored.byteSize,
      originalByteSize: stored.originalByteSize,
      contentHash: stored.contentHash,
      extractedJson: {
        ...extracted,
        documentKind: kind,
        personType,
        warnings: docWarnings,
      } as object,
      errorMessage: combinedNotice || null,
      personType,
      grossAmount: gross,
      netAmount: extracted.netAmount ?? null,
      taxTotal,
      taxesJson: extracted.taxes
        ? (extracted.taxes as object)
        : undefined,
      workspaceId: entitlements.workspaceId,
      planningProjectId,
    },
  });

  revalidatePlanning(planningProjectId);
  const attachQs = attachCommitmentId
    ? `?attachCommitmentId=${encodeURIComponent(attachCommitmentId)}`
    : "";
  redirect(
    `/planejamento/${planningProjectId}/nf/${doc.id}/revisar${attachQs}`,
  );
}

/**
 * Remove NF/RPA se o usuário tem permissão e ainda não há comprovante vinculado.
 * Em REVIEW: apaga só o documento.
 * Em IMPORTED: desfaz rateio, reservas e contratações geradas pela NF.
 */
export async function deletePlanningFiscalDocument(
  documentId: string,
): Promise<ActionState> {
  await requireUser();
  if (!(await canDeleteNf())) {
    return {
      error:
        "Sem permissão para excluir NF/RPA. Peça a tela «Excluir NF/RPA (Planejamento)» no MAX Cultural.",
    };
  }
  const { entitlements } = await getWorkspaceContext();

  const doc = await prisma.planningDocument.findFirst({
    where: {
      id: documentId,
      workspaceId: entitlements.workspaceId,
      kind: { in: ["NF", "RPA"] },
    },
    include: {
      allocations: { select: { commitmentId: true } },
      derivedProofs: { select: { id: true, kind: true } },
    },
  });
  if (!doc) return { error: "Documento não encontrado" };

  const proofCount = await prisma.planningDocument.count({
    where: {
      workspaceId: entitlements.workspaceId,
      kind: { in: ["PAYMENT_PROOF", "TAX_PROOF"] },
      OR: [
        { sourceDocumentId: doc.id },
        {
          allocations: {
            some: {
              commitmentId: {
                in: doc.allocations.map((a) => a.commitmentId),
              },
            },
          },
        },
      ],
    },
  });
  if (proofCount > 0 || doc.derivedProofs.length > 0) {
    return {
      error:
        "Não é possível excluir: já existe comprovante de pagamento vinculado a esta NF/RPA.",
    };
  }

  const planningProjectId = doc.planningProjectId;
  const commitmentIds = [
    ...new Set(
      [
        ...doc.allocations.map((a) => a.commitmentId),
        doc.commitmentId,
      ].filter(Boolean) as string[],
    ),
  ];

  const storagePath = doc.storagePath;

  await prisma.$transaction(async (tx) => {
    if (commitmentIds.length > 0) {
      await tx.documentRubricAllocation.deleteMany({
        where: {
          OR: [
            { documentId: doc.id },
            { commitmentId: { in: commitmentIds } },
          ],
        },
      });

      const commitments = await tx.rubricCommitment.findMany({
        where: { id: { in: commitmentIds }, workspaceId: entitlements.workspaceId },
        select: { id: true, engagementId: true },
      });
      const engagementIds = commitments.map((c) => c.engagementId);

      for (const cid of commitmentIds) {
        await tx.appNotification.deleteMany({
          where: {
            workspaceId: entitlements.workspaceId,
            href: `/planejamento/compromissos/${cid}`,
          },
        });
      }

      await tx.rubricCommitment.deleteMany({
        where: { id: { in: commitmentIds } },
      });

      if (engagementIds.length > 0) {
        await tx.catalogEngagement.deleteMany({
          where: {
            id: { in: engagementIds },
            workspaceId: entitlements.workspaceId,
            source: { in: ["PLANNING_NF", "PLANNING_RPA"] },
          },
        });
      }
    }

    await tx.planningDocument.delete({ where: { id: doc.id } });
  });

  try {
    const { unlink } = await import("fs/promises");
    await unlink(storagePath);
  } catch {
    // arquivo já ausente
  }

  if (planningProjectId) revalidatePlanning(planningProjectId);
  revalidatePath("/planejamento");
  revalidatePath("/fornecedores/contratacoes");
  return { ok: true, message: `${doc.kind} excluída.` };
}

async function attachNfToPendingCommitment(params: {
  session: { id: string; email?: string | null };
  entitlements: { workspaceId: string };
  documentId: string;
  doc: {
    id: string;
    kind: string;
    filename: string;
    planningProjectId: string | null;
    extractedJson: unknown;
  };
  formData: FormData;
  attachCommitmentId: string;
  hasBond: boolean;
  serviceName: string;
  supplierName: string;
  cnpj: string;
  grossAmount: number;
  taxesFromForm: Record<string, number | null>;
}): Promise<ActionState> {
  const {
    session,
    entitlements,
    documentId,
    doc,
    formData,
    attachCommitmentId,
    hasBond,
    serviceName,
    supplierName,
    cnpj,
    grossAmount,
    taxesFromForm,
  } = params;

  if (!cnpj || !supplierName || !serviceName || !(grossAmount > 0)) {
    return { error: "Preencha fornecedor, serviço e valor bruto" };
  }

  const sharesRaw = String(formData.get("allocationsJson") || "[]");
  let formAllocations: Array<{ budgetLineId: string; sharePct: number }> = [];
  try {
    formAllocations = JSON.parse(sharesRaw) as Array<{
      budgetLineId: string;
      sharePct: number;
    }>;
  } catch {
    return { error: "Rateio inválido" };
  }
  formAllocations = formAllocations
    .map((a) => ({
      budgetLineId: String(a.budgetLineId || ""),
      sharePct: Math.round(Number(a.sharePct) * 10000) / 10000,
    }))
    .filter((a) => a.budgetLineId && a.sharePct > 0);

  const commitment = await prisma.rubricCommitment.findFirst({
    where: {
      id: attachCommitmentId,
      workspaceId: entitlements.workspaceId,
      nfPending: true,
      status: "PAID",
    },
    include: {
      planningProject: { select: { id: true, externalCode: true } },
      engagement: { select: { id: true, serviceId: true } },
    },
  });
  if (!commitment) {
    return { error: "Compromisso não encontrado ou já regularizado" };
  }
  if (commitment.planningProjectId !== doc.planningProjectId) {
    return { error: "NF não pertence ao mesmo projeto do pagamento" };
  }

  const proof = await prisma.planningDocument.findFirst({
    where: {
      workspaceId: entitlements.workspaceId,
      kind: "PAYMENT_PROOF",
      OR: [
        { commitmentId: attachCommitmentId },
        { allocations: { some: { commitmentId: attachCommitmentId } } },
      ],
    },
    include: {
      allocations: {
        include: {
          commitment: {
            select: {
              id: true,
              budgetLineId: true,
              amount: true,
              nfPending: true,
              status: true,
            },
          },
        },
        orderBy: { sharePct: "desc" },
      },
    },
  });

  const proofSlices = (proof?.allocations ?? []).filter(
    (a) => a.commitment.nfPending && a.commitment.status === "PAID",
  );

  type AttachSlice = {
    budgetLineId: string;
    sharePct: number;
    amount: number;
    commitmentId: string;
  };

  let slices: AttachSlice[];

  if (proofSlices.length > 0) {
    if (formAllocations.length > 0) {
      const proofLineIds = new Set(proofSlices.map((s) => s.budgetLineId));
      const formLineIds = new Set(formAllocations.map((a) => a.budgetLineId));
      if (
        proofSlices.length > 1 &&
        (formLineIds.size !== proofLineIds.size ||
          [...formLineIds].some((id) => !proofLineIds.has(id)))
      ) {
        return {
          error:
            "O rateio da NF deve usar as mesmas rubricas do comprovante de pagamento.",
        };
      }
      const shareSum = formAllocations.reduce((s, a) => s + a.sharePct, 0);
      if (Math.abs(shareSum - 100) > 0.05) {
        return {
          error: `A soma dos percentuais deve ser 100% (atual: ${shareSum.toFixed(2)}%)`,
        };
      }
      slices = formAllocations.map((fa) => {
        const proofSlice = proofSlices.find(
          (s) => s.budgetLineId === fa.budgetLineId,
        );
        if (!proofSlice) {
          throw new Error("SLICE:Rubrica do rateio não encontrada no pagamento");
        }
        return {
          budgetLineId: fa.budgetLineId,
          sharePct: fa.sharePct,
          amount: Number(proofSlice.amount),
          commitmentId: proofSlice.commitmentId,
        };
      });
    } else {
      slices = proofSlices.map((s) => ({
        budgetLineId: s.budgetLineId,
        sharePct: Number(s.sharePct),
        amount: Number(s.amount),
        commitmentId: s.commitmentId,
      }));
    }
  } else {
    if (formAllocations.length === 0) {
      formAllocations = [{ budgetLineId: commitment.budgetLineId, sharePct: 100 }];
    }
    const shareSum = formAllocations.reduce((s, a) => s + a.sharePct, 0);
    if (Math.abs(shareSum - 100) > 0.05) {
      return {
        error: `A soma dos percentuais deve ser 100% (atual: ${shareSum.toFixed(2)}%)`,
      };
    }
    slices = formAllocations.map((fa) => ({
      budgetLineId: fa.budgetLineId,
      sharePct: fa.sharePct,
      amount:
        fa.budgetLineId === commitment.budgetLineId
          ? Number(commitment.amount)
          : Math.round(grossAmount * (fa.sharePct / 100) * 100) / 100,
      commitmentId:
        fa.budgetLineId === commitment.budgetLineId
          ? commitment.id
          : "",
    }));
    if (slices.some((s) => !s.commitmentId)) {
      return {
        error:
          "Pagamento antecipado em várias rubricas exige comprovante com rateio.",
      };
    }
  }

  const committedTotal = slices.reduce((s, sl) => s + sl.amount, 0);
  if (Math.abs(committedTotal - grossAmount) > 0.02) {
    return {
      error: `Valor da NF (${grossAmount.toFixed(2)}) difere do pagamento registrado (${committedTotal.toFixed(2)}).`,
    };
  }

  const taxTotal = taxTotalOf(taxesFromForm);
  const siblingIds = [...new Set(slices.map((s) => s.commitmentId))];

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.planningDocument.updateMany({
        where: {
          id: documentId,
          workspaceId: entitlements.workspaceId,
          status: "REVIEW",
        },
        data: {
          status: "IMPORTED",
          engagementId: commitment.engagementId,
          commitmentId: commitment.id,
          grossAmount,
          taxTotal,
          taxesJson: taxesFromForm as object,
        },
      });
      if (claimed.count !== 1) {
        throw new Error("DOCUMENT_ALREADY_RESERVED");
      }

      for (const slice of slices) {
        await tx.documentRubricAllocation.create({
          data: {
            documentId: doc.id,
            budgetLineId: slice.budgetLineId,
            commitmentId: slice.commitmentId,
            sharePct: slice.sharePct,
            amount: slice.amount,
            taxesJson: scaleTaxes(taxesFromForm, slice.sharePct) as object,
          },
        });
      }

      await tx.rubricCommitment.updateMany({
        where: {
          id: { in: siblingIds },
          workspaceId: entitlements.workspaceId,
          nfPending: true,
          status: "PAID",
        },
        data: {
          nfPending: false,
          hasBond,
        },
      });

      if (proof) {
        await tx.planningDocument.update({
          where: { id: proof.id },
          data: { sourceDocumentId: doc.id },
        });
      }

      await tx.appNotification.deleteMany({
        where: {
          workspaceId: entitlements.workspaceId,
          type: "NF_PENDING",
          href: {
            in: siblingIds.map((id) => `/planejamento/compromissos/${id}`),
          },
        },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "DOCUMENT_ALREADY_RESERVED") {
      return { error: "Este documento já foi vinculado." };
    }
    if (msg.startsWith("SLICE:")) {
      return { error: msg.slice("SLICE:".length) };
    }
    throw err;
  }

  revalidatePlanning(commitment.planningProjectId!);
  redirect(`/planejamento/compromissos/${commitment.id}`);
}

export async function confirmNfReservation(
  documentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();

  const hasBond = formData.get("hasBond") === "on" || formData.get("hasBond") === "true";
  const serviceName = String(formData.get("serviceName") || "").trim();
  const supplierName = String(formData.get("supplierName") || "").trim();
  const cnpj = normalizeCgccpf(String(formData.get("cnpj") || ""));
  const hiredAtRaw = String(formData.get("hiredAt") || "");
  const paymentReminderRaw = String(formData.get("paymentReminderAt") || "");
  let cnaeCode = normalizeCnaeCode(String(formData.get("cnaeCode") || ""));
  let cnaeDescription = String(formData.get("cnaeDescription") || "").trim() || null;
  const grossAmount =
    parseBrMoney(String(formData.get("grossAmount") || formData.get("amount") || "")) || 0;
  const paymentFromForm = {
    pixKey: String(formData.get("pixKey") || "").trim() || null,
    bankName: String(formData.get("bankName") || "").trim() || null,
    bankAgency: String(formData.get("bankAgency") || "").trim() || null,
    bankAccount: String(formData.get("bankAccount") || "").trim() || null,
    paymentNotes: String(formData.get("paymentNotes") || "").trim() || null,
  };

  const taxesFromForm = {
    iss: parseBrMoney(String(formData.get("taxIss") || "")),
    irrf: parseBrMoney(String(formData.get("taxIrrf") || "")),
    inss: parseBrMoney(String(formData.get("taxInss") || "")),
    csll: parseBrMoney(String(formData.get("taxCsll") || "")),
    pis: parseBrMoney(String(formData.get("taxPis") || "")),
    cofins: parseBrMoney(String(formData.get("taxCofins") || "")),
    other: parseBrMoney(String(formData.get("taxOther") || "")),
  };
  const taxTotal = taxTotalOf(taxesFromForm);

  const sharesRaw = String(formData.get("allocationsJson") || "[]");
  let allocations: Array<{ budgetLineId: string; sharePct: number }> = [];
  try {
    allocations = JSON.parse(sharesRaw) as Array<{ budgetLineId: string; sharePct: number }>;
  } catch {
    return { error: "Rateio inválido" };
  }
  allocations = allocations
    .map((a) => ({
      budgetLineId: String(a.budgetLineId || ""),
      sharePct: Math.round(Number(a.sharePct) * 10000) / 10000,
    }))
    .filter((a) => a.budgetLineId && a.sharePct > 0);

  const doc = await prisma.planningDocument.findFirst({
    where: {
      id: documentId,
      workspaceId: entitlements.workspaceId,
      kind: { in: ["NF", "RPA"] },
    },
  });
  if (!doc?.planningProjectId) return { error: "Documento inválido" };
  if (doc.status === "IMPORTED") {
    return { error: "Este documento já foi reservado." };
  }
  if (doc.status !== "REVIEW") {
    return { error: "Documento ainda não está pronto para reserva." };
  }

  const attachCommitmentId = String(
    formData.get("attachCommitmentId") || "",
  ).trim();

  if (attachCommitmentId) {
    return attachNfToPendingCommitment({
      session,
      entitlements,
      documentId,
      doc,
      formData,
      attachCommitmentId,
      hasBond:
        formData.get("hasBond") === "on" ||
        formData.get("hasBond") === "true",
      serviceName: String(formData.get("serviceName") || "").trim(),
      supplierName: String(formData.get("supplierName") || "").trim(),
      cnpj: normalizeCgccpf(String(formData.get("cnpj") || "")),
      grossAmount:
        parseBrMoney(
          String(formData.get("grossAmount") || formData.get("amount") || ""),
        ) || 0,
      taxesFromForm: {
        iss: parseBrMoney(String(formData.get("taxIss") || "")),
        irrf: parseBrMoney(String(formData.get("taxIrrf") || "")),
        inss: parseBrMoney(String(formData.get("taxInss") || "")),
        csll: parseBrMoney(String(formData.get("taxCsll") || "")),
        pis: parseBrMoney(String(formData.get("taxPis") || "")),
        cofins: parseBrMoney(String(formData.get("taxCofins") || "")),
        other: parseBrMoney(String(formData.get("taxOther") || "")),
      },
    });
  }

  const project = await prisma.planningProject.findFirst({
    where: { id: doc.planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: true } },
      commitments: { where: { status: { in: ["RESERVED", "PAID"] } } },
      ruleset: true,
      project: { select: { valorCaptado: true } },
    },
  });
  if (!project?.sheet) return { error: "Projeto sem planilha" };
  if (!cnpj || !supplierName || !serviceName || !(grossAmount > 0)) {
    return { error: "Preencha fornecedor, serviço e valor bruto" };
  }
  if (allocations.length === 0) {
    return { error: "Informe ao menos uma rubrica no rateio" };
  }
  const uniqueLines = new Set(allocations.map((a) => a.budgetLineId));
  if (uniqueLines.size !== allocations.length) {
    return { error: "Não é permitido ratear duas vezes na mesma rubrica" };
  }
  const shareSum = allocations.reduce((s, a) => s + a.sharePct, 0);
  if (Math.abs(shareSum - 100) > 0.05) {
    return { error: `A soma dos percentuais deve ser 100% (atual: ${shareSum.toFixed(2)}%)` };
  }

  const isCnpj = cnpj.length === 14;
  if (isCnpj && !cnaeCode) {
    const lookup = await lookupCnpj(cnpj);
    if (lookup?.cnaeCode) {
      cnaeCode = lookup.cnaeCode;
      cnaeDescription = cnaeDescription || lookup.cnaeDescription;
    }
  }
  if (isCnpj && !cnaeCode) {
    return { error: "Informe o CNAE do fornecedor (obrigatório para CNPJ)." };
  }

  const extracted = (doc.extractedJson || {}) as {
    serviceDescription?: string | null;
    payment?: {
      pixKey?: string | null;
      bankName?: string | null;
      bankAgency?: string | null;
      bankAccount?: string | null;
      paymentNotes?: string | null;
    } | null;
  };
  const paymentFromExtract = {
    pixKey: extracted.payment?.pixKey ?? null,
    bankName: extracted.payment?.bankName ?? null,
    bankAgency: extracted.payment?.bankAgency ?? null,
    bankAccount: extracted.payment?.bankAccount ?? null,
    paymentNotes: extracted.payment?.paymentNotes ?? null,
  };
  const paymentHeuristic = extractPaymentDetails(
    [serviceName, extracted.serviceDescription].filter(Boolean).join("\n"),
  );
  const paymentIncoming = mergePaymentDetails(
    paymentFromForm,
    mergePaymentDetails(paymentFromExtract, paymentHeuristic),
  );

  const valorCaptado =
    (project.project?.valorCaptado != null
      ? Number(project.project.valorCaptado)
      : null) ?? 0;

  const balance = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
    valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
  });

  const allowOverflow = await canExceedRubric();
  const slices: Array<{
    budgetLineId: string;
    sharePct: number;
    amount: number;
    taxesJson: object;
  }> = [];

  for (const alloc of allocations) {
    const line = project.sheet.lines.find((l) => l.id === alloc.budgetLineId);
    if (!line) return { error: "Rubrica do rateio não encontrada" };
    const amount = Math.round(grossAmount * (alloc.sharePct / 100) * 100) / 100;
    const check = canReserveAmount({
      lineId: alloc.budgetLineId,
      amount,
      balance,
      allowOverflow: allowOverflow && !isAdminProduct(line.productName),
    });
    if (!check.ok) {
      return {
        error: `${line.itemName}: ${check.message}`,
      };
    }
    // simulate consume for sequential checks
    const bal = balance.lines.get(alloc.budgetLineId)!;
    bal.reserved += amount;
    bal.available -= amount;
    balance.totalReserved += amount;
    balance.totalAvailable -= amount;

    slices.push({
      budgetLineId: alloc.budgetLineId,
      sharePct: alloc.sharePct,
      amount,
      taxesJson: scaleTaxes(taxesFromForm, alloc.sharePct) as object,
    });
  }

  const rules = toActiveRules(project.ruleset);
  const projectTotal =
    valorCaptado > 0 ? valorCaptado : Number(project.sheet.totalApproved);
  const priorEngagements = await prisma.catalogEngagement.findMany({
    where: {
      planningProjectId: project.id,
      service: { supplier: { cnpj } },
    },
    select: { price: true },
  });
  const priorSum = priorEngagements.reduce((s, e) => s + Number(e.price), 0);
  const supplierAlert = evaluateSupplierLimit({
    pronac: project.externalCode,
    projectTotal,
    supplierName,
    supplierCgccpf: cnpj,
    amount: priorSum + grossAmount,
    accountCgccpf: (
      await prisma.salicAccount.findUnique({ where: { id: project.accountId } })
    )?.cgccpf,
    rules,
  });
  if (supplierAlert?.level === "critical") {
    return { error: supplierAlert.title };
  }

  // Vencimento = 5º dia útil do mês seguinte à emissão/contratação (hiredAt).
  const hiredAt = hiredAtRaw
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(hiredAtRaw) ? `${hiredAtRaw}T12:00:00` : hiredAtRaw)
    : new Date();
  const expectedPayAt = fifthBusinessDayNextMonth(hiredAt);
  const paymentReminderAt = parseReminderDate(
    paymentReminderRaw,
    expectedPayAt,
  );
  const docKind = doc.kind === "RPA" ? "RPA" : "NF";
  const prefs = await getNotificationPrefs(
    entitlements.workspaceId,
    session.id,
  );

  let firstCommitmentId: string;
  try {
    firstCommitmentId = await prisma.$transaction(async (tx) => {
    // Serializa reservas no mesmo projeto e impede double-submit do mesmo doc.
    await tx.$executeRaw`SELECT id FROM planning_projects WHERE id = ${project.id} FOR UPDATE`;

    const claimed = await tx.planningDocument.updateMany({
      where: {
        id: doc.id,
        workspaceId: entitlements.workspaceId,
        status: "REVIEW",
      },
      data: { status: "IMPORTED" },
    });
    if (claimed.count !== 1) {
      throw new Error("DOCUMENT_ALREADY_RESERVED");
    }

    const freshCommitments = await tx.rubricCommitment.findMany({
      where: {
        planningProjectId: project.id,
        status: { in: ["RESERVED", "PAID"] },
      },
    });
    const liveBalance = computeProjectBalance({
      lines: project.sheet!.lines,
      commitments: freshCommitments,
      valorCaptado,
      captadoRecebido: project.captadoRecebido,
      captadoTransferido: project.captadoTransferido,
      rendimentos: project.rendimentos,
    });
    for (const slice of slices) {
      const line = project.sheet!.lines.find((l) => l.id === slice.budgetLineId);
      if (!line) throw new Error("BALANCE:Rubrica do rateio não encontrada");
      const check = canReserveAmount({
        lineId: slice.budgetLineId,
        amount: slice.amount,
        balance: liveBalance,
        allowOverflow: allowOverflow && !isAdminProduct(line.productName),
      });
      if (!check.ok) {
        throw new Error(`BALANCE:${line.itemName}: ${check.message}`);
      }
      const bal = liveBalance.lines.get(slice.budgetLineId)!;
      bal.reserved += slice.amount;
      bal.available -= slice.amount;
      liveBalance.totalReserved += slice.amount;
      liveBalance.totalAvailable -= slice.amount;
    }

    const existingSupplier = await tx.catalogSupplier.findUnique({
      where: {
        workspaceId_cnpj: { workspaceId: entitlements.workspaceId, cnpj },
      },
    });
    const mergedPayment = mergePaymentDetails(
      existingSupplier
        ? {
            pixKey: existingSupplier.pixKey,
            bankName: existingSupplier.bankName,
            bankAgency: existingSupplier.bankAgency,
            bankAccount: existingSupplier.bankAccount,
            paymentNotes: existingSupplier.paymentNotes,
          }
        : null,
      paymentIncoming,
    );

    const supplier = await tx.catalogSupplier.upsert({
      where: {
        workspaceId_cnpj: { workspaceId: entitlements.workspaceId, cnpj },
      },
      create: {
        workspaceId: entitlements.workspaceId,
        cnpj,
        name: supplierName,
        cnaeCode: isCnpj ? cnaeCode : null,
        cnaeDescription: isCnpj ? cnaeDescription : null,
        pixKey: mergedPayment.pixKey,
        bankName: mergedPayment.bankName,
        bankAgency: mergedPayment.bankAgency,
        bankAccount: mergedPayment.bankAccount,
        paymentNotes: mergedPayment.paymentNotes,
      },
      update: {
        name: supplierName,
        ...(isCnpj && cnaeCode
          ? {
              cnaeCode: existingSupplier?.cnaeCode || cnaeCode,
              cnaeDescription:
                existingSupplier?.cnaeDescription || cnaeDescription,
            }
          : {}),
        pixKey: mergedPayment.pixKey,
        bankName: mergedPayment.bankName,
        bankAgency: mergedPayment.bankAgency,
        bankAccount: mergedPayment.bankAccount,
        paymentNotes: mergedPayment.paymentNotes,
      },
    });

    let service = await tx.catalogService.findFirst({
      where: {
        supplierId: supplier.id,
        name: { equals: serviceName, mode: "insensitive" },
      },
    });
    if (!service) {
      service = await tx.catalogService.create({
        data: {
          supplierId: supplier.id,
          name: serviceName,
          category:
            project.sheet!.lines.find((l) => l.id === slices[0]!.budgetLineId)
              ?.categoryHint || "outros",
        },
      });
    }

    let primaryCommitmentId: string | null = null;
    let primaryEngagementId: string | null = null;

    for (const slice of slices) {
      const engagement = await tx.catalogEngagement.create({
        data: {
          workspaceId: entitlements.workspaceId,
          serviceId: service.id,
          price: slice.amount,
          unitPrice: slice.amount,
          quantity: 1,
          priceUnit: "closed",
          hiredAt,
          source: docKind === "RPA" ? "PLANNING_RPA" : "PLANNING_NF",
          planningProjectId: project.id,
          budgetLineId: slice.budgetLineId,
          notes: `${docKind} ${doc.filename} · ${slice.sharePct}%`,
        },
      });

      const commitment = await tx.rubricCommitment.create({
        data: {
          budgetLineId: slice.budgetLineId,
          planningProjectId: project.id,
          workspaceId: entitlements.workspaceId,
          engagementId: engagement.id,
          amount: slice.amount,
          allocationSharePct: slice.sharePct,
          status: "RESERVED",
          hasBond,
          expectedPayAt,
          paymentReminderAt,
          createdById: session.id,
        },
      });

      await tx.documentRubricAllocation.create({
        data: {
          documentId: doc.id,
          budgetLineId: slice.budgetLineId,
          commitmentId: commitment.id,
          sharePct: slice.sharePct,
          amount: slice.amount,
          taxesJson: slice.taxesJson,
        },
      });

      if (!primaryCommitmentId) {
        primaryCommitmentId = commitment.id;
        primaryEngagementId = engagement.id;
      }
    }

    await tx.planningDocument.update({
      where: { id: doc.id },
      data: {
        status: "IMPORTED",
        commitmentId: primaryCommitmentId,
        engagementId: primaryEngagementId,
        personType: isCnpj ? "PJ" : "PF",
        grossAmount,
        netAmount: Math.round((grossAmount - taxTotal) * 100) / 100,
        taxTotal,
        taxesJson: taxesFromForm as object,
      },
    });

    if (hasBond) {
      await tx.observadoBond.upsert({
        where: {
          salicAccountId_cgccpf_rulesetVersion: {
            salicAccountId: project.accountId,
            cgccpf: cnpj,
            rulesetVersion: project.rulesetVersion,
          },
        },
        create: {
          workspaceId: entitlements.workspaceId,
          salicAccountId: project.accountId,
          cgccpf: cnpj,
          rulesetVersion: project.rulesetVersion,
          enabled: true,
        },
        update: { enabled: true },
      });
    }

    const taxSummary = taxDueSummaryFromCompetence(hiredAt, taxesFromForm);
    const href = `/planejamento/compromissos/${primaryCommitmentId}`;

    if (prefs.taxDueIss && taxSummary.issDue && taxSummary.issAmount > 0) {
      await tx.appNotification.create({
        data: {
          workspaceId: entitlements.workspaceId,
          userId: session.id,
          type: "TAX_DUE_ISS",
          title: `ISS retido — ${project.externalCode}`,
          body: `Guia/DAM de ISS (R$ ${taxSummary.issAmount.toFixed(2)}) vence em ${taxSummary.issDue.toLocaleDateString("pt-BR")} (dia 10).`,
          href,
          scheduledFor: taxSummary.issDue,
          meta: {
            commitmentId: primaryCommitmentId,
            documentId: doc.id,
            taxKind: "ISS",
            amount: taxSummary.issAmount,
            dueAt: taxSummary.issDue.toISOString(),
          },
        },
      });
    }

    if (
      prefs.taxDueFederal &&
      taxSummary.federalDue &&
      taxSummary.federalAmount > 0
    ) {
      await tx.appNotification.create({
        data: {
          workspaceId: entitlements.workspaceId,
          userId: session.id,
          type: "TAX_DUE_FEDERAL",
          title: `Impostos federais — ${project.externalCode}`,
          body: `DARF de retenções (R$ ${taxSummary.federalAmount.toFixed(2)}) vence em ${taxSummary.federalDue.toLocaleDateString("pt-BR")} (dia 20).`,
          href,
          scheduledFor: taxSummary.federalDue,
          meta: {
            commitmentId: primaryCommitmentId,
            documentId: doc.id,
            taxKind: "FEDERAL",
            amount: taxSummary.federalAmount,
            dueAt: taxSummary.federalDue.toISOString(),
          },
        },
      });
    }

    return primaryCommitmentId!;
    }, { timeout: 20_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "DOCUMENT_ALREADY_RESERVED") {
      return { error: "Este documento já foi reservado." };
    }
    if (msg.startsWith("BALANCE:")) {
      return { error: msg.slice("BALANCE:".length) };
    }
    throw err;
  }

  revalidatePlanning(project.id);
  redirect(`/planejamento/compromissos/${firstCommitmentId}`);
}

export async function uploadPaymentProof(
  commitmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const kind = String(formData.get("kind") || "PAYMENT_PROOF") as
    | "PAYMENT_PROOF"
    | "TAX_PROOF";
  if (kind !== "PAYMENT_PROOF" && kind !== "TAX_PROOF") {
    return { error: "Tipo de comprovante inválido" };
  }
  const file = formData.get("proofFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o arquivo" };
  }

  const commitment = await prisma.rubricCommitment.findFirst({
    where: { id: commitmentId, workspaceId: entitlements.workspaceId },
    include: {
      planningProject: { select: { externalCode: true } },
      engagement: {
        select: {
          service: {
            select: {
              name: true,
              supplier: { select: { name: true, cnpj: true } },
            },
          },
        },
      },
      allocations: {
        include: {
          document: {
            select: {
              id: true,
              kind: true,
              status: true,
              filename: true,
              grossAmount: true,
              taxTotal: true,
              taxesJson: true,
              allocations: {
                select: {
                  budgetLineId: true,
                  commitmentId: true,
                  sharePct: true,
                  amount: true,
                  taxesJson: true,
                },
              },
            },
          },
        },
      },
      documents: {
        where: { kind: { in: ["NF", "RPA"] }, status: "IMPORTED" },
        select: {
          id: true,
          kind: true,
          status: true,
          filename: true,
          grossAmount: true,
          taxTotal: true,
          taxesJson: true,
          allocations: {
            select: {
              budgetLineId: true,
              commitmentId: true,
              sharePct: true,
              amount: true,
              taxesJson: true,
            },
          },
        },
        take: 1,
      },
    },
  });
  if (!commitment) return { error: "Compromisso não encontrado" };

  if (kind === "PAYMENT_PROOF" && commitment.status === "PAID") {
    return { error: "Pagamento já registrado para este compromisso." };
  }

  // NF/RPA de origem: via rateio desta reserva ou commitmentId legado da NF.
  const viaAlloc = commitment.allocations.find(
    (a) =>
      (a.document.kind === "NF" || a.document.kind === "RPA") &&
      a.document.status === "IMPORTED",
  )?.document;
  const sourceNf = viaAlloc || commitment.documents[0] || null;

  const proofDisplayName = buildPlanningDocumentFilename({
    kind,
    projectCode: commitment.planningProject.externalCode,
    supplierName: commitment.engagement.service.supplier.name,
    supplierDoc: commitment.engagement.service.supplier.cnpj,
    hiredAt: new Date().toISOString().slice(0, 10),
    amount: Number(commitment.amount),
    originalFilename: file.name,
    mimeType: file.type || "application/octet-stream",
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const proofExtracted = await extractProofFromBuffer({
    buffer,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
  });

  const proofWarnings: string[] = [];
  const projectCheck = checkProjectCodeInDocument({
    text: proofExtracted.rawText,
    expectedCode: commitment.planningProject.externalCode,
    extractedPronac: proofExtracted.pronac,
  });
  if (projectCheck.warning) proofWarnings.push(projectCheck.warning);

  let stored;
  try {
    stored = await persistPlanningUpload({
      buffer,
      filename: proofDisplayName,
      mimeType: file.type || "application/octet-stream",
      workspaceId: entitlements.workspaceId,
      rejectDuplicate: {
        planningProjectId: commitment.planningProjectId,
        kinds: [kind],
      },
    });
  } catch (e) {
    if (e instanceof DuplicateDocumentError) {
      return { error: e.message.slice("DUPLICATE:".length) };
    }
    throw e;
  }

  /** Comprovante de imposto sem NF (pagamento antecipado). */
  if (!sourceNf && kind === "TAX_PROOF" && commitment.nfPending) {
    await prisma.planningDocument.create({
      data: {
        kind,
        status: "IMPORTED",
        filename: proofDisplayName,
        mimeType: file.type || "application/octet-stream",
        storagePath: stored.storagePath,
        byteSize: stored.byteSize,
        originalByteSize: stored.originalByteSize,
        contentHash: stored.contentHash,
        workspaceId: entitlements.workspaceId,
        planningProjectId: commitment.planningProjectId,
        engagementId: commitment.engagementId,
        commitmentId: commitment.id,
      },
    });
    revalidatePlanning(commitment.planningProjectId);
    revalidatePath(`/planejamento/compromissos/${commitmentId}`);
    const baseMsg = "Comprovante de imposto salvo (NF ainda pendente).";
    return {
      ok: true,
      message: proofWarnings.length
        ? `${baseMsg} Atenção: ${proofWarnings.join(" ")}`
        : baseMsg,
    };
  }

  if (!sourceNf) {
    return {
      error:
        "Esta reserva não está ligada a uma NF/RPA. Confirme a nota antes de enviar o comprovante.",
    };
  }

  const siblingAllocs = sourceNf.allocations;
  if (siblingAllocs.length === 0) {
    return { error: "NF/RPA sem rateio de rubricas" };
  }

  const expectedPaymentAmount =
    siblingAllocs.reduce((s, a) => s + Number(a.amount), 0) ||
    Number(sourceNf.grossAmount ?? commitment.amount);

  if (kind === "PAYMENT_PROOF") {
    const amountCheck = checkPaymentAmount({
      extractedAmount: proofExtracted.amount,
      expectedAmount: expectedPaymentAmount,
    });
    if (amountCheck.error) return { error: amountCheck.error };
    if (amountCheck.warning) proofWarnings.push(amountCheck.warning);
  }

  if (kind === "TAX_PROOF") {
    const expectedTaxes = (sourceNf.taxesJson ?? {}) as ExtractedTaxes;
    const taxCheck = checkTaxProofAgainstNf({
      extractedTaxes: proofExtracted.taxes,
      extractedTaxTotal: proofExtracted.taxTotal,
      expectedTaxes,
      expectedTaxTotal:
        sourceNf.taxTotal != null ? Number(sourceNf.taxTotal) : null,
    });
    if (taxCheck.error) return { error: taxCheck.error };
    if (taxCheck.warning) proofWarnings.push(taxCheck.warning);
  }

  const siblingCommitmentIds = [
    ...new Set(siblingAllocs.map((a) => a.commitmentId)),
  ];

  await prisma.$transaction(async (tx) => {
    const proof = await tx.planningDocument.create({
      data: {
        kind,
        status: "IMPORTED",
        filename: proofDisplayName,
        mimeType: file.type || "application/octet-stream",
        storagePath: stored.storagePath,
        byteSize: stored.byteSize,
        originalByteSize: stored.originalByteSize,
        contentHash: stored.contentHash,
        workspaceId: entitlements.workspaceId,
        planningProjectId: commitment.planningProjectId,
        engagementId: commitment.engagementId,
        commitmentId: commitment.id,
        sourceDocumentId: sourceNf.id,
      },
    });

    // Espelha o rateio da NF/RPA no comprovante (mesmas rubricas/%).
    for (const slice of siblingAllocs) {
      await tx.documentRubricAllocation.create({
        data: {
          documentId: proof.id,
          budgetLineId: slice.budgetLineId,
          commitmentId: slice.commitmentId,
          sharePct: slice.sharePct,
          amount: slice.amount,
          taxesJson: slice.taxesJson ?? undefined,
        },
      });
    }

    if (kind === "PAYMENT_PROOF") {
      await tx.rubricCommitment.updateMany({
        where: {
          id: { in: siblingCommitmentIds },
          workspaceId: entitlements.workspaceId,
          status: "RESERVED",
        },
        data: { status: "PAID", paidAt: new Date() },
      });
      for (const cid of siblingCommitmentIds) {
        await tx.appNotification.deleteMany({
          where: {
            workspaceId: entitlements.workspaceId,
            href: `/planejamento/compromissos/${cid}`,
            type: { in: ["PAYMENT_OVERDUE", "PAYMENT_DUE_SOON"] },
          },
        });
      }
    }

    if (kind === "TAX_PROOF") {
      await tx.appNotification.deleteMany({
        where: {
          workspaceId: entitlements.workspaceId,
          type: { in: ["TAX_DUE_ISS", "TAX_DUE_FEDERAL"] },
          href: {
            in: siblingCommitmentIds.map(
              (id) => `/planejamento/compromissos/${id}`,
            ),
          },
        },
      });
    }
  });

  revalidatePlanning(commitment.planningProjectId);
  revalidatePath(`/planejamento/compromissos/${commitmentId}`);
  const baseMsg =
    siblingCommitmentIds.length > 1
      ? `Comprovante vinculado à ${sourceNf.kind} e rateado em ${siblingCommitmentIds.length} rubricas.`
      : `Comprovante vinculado à ${sourceNf.kind}.`;
  return {
    ok: true,
    message: proofWarnings.length
      ? `${baseMsg} Atenção: ${proofWarnings.join(" ")}`
      : baseMsg,
  };
}

/** Anexa NF ou comprovante a uma contratação (desativado — use o Planejamento). */
export async function linkEngagementDocument(
  _engagementId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireUser();
  return {
    error:
      "Envie NF/RPA e comprovantes pelo módulo Planejamento. Em Fornecedores os arquivos aparecem só para consulta.",
  };
}

export async function markNotificationRead(id: string) {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  await prisma.appNotification.updateMany({
    where: {
      id,
      workspaceId: entitlements.workspaceId,
      readAt: null,
      OR: [{ userId: session.id }, { userId: null }],
    },
    data: { readAt: new Date() },
  });
  revalidatePath("/planejamento");
  revalidatePath("/notificacoes");
}

export async function markAllNotificationsRead() {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  await prisma.appNotification.updateMany({
    where: {
      workspaceId: entitlements.workspaceId,
      OR: [{ userId: session.id }, { userId: null }],
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  revalidatePath("/planejamento");
  revalidatePath("/notificacoes");
}

export async function saveNotificationSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();

  const dueSoonDaysAhead = Math.min(
    30,
    Math.max(1, Number(formData.get("dueSoonDaysAhead") || 5) || 5),
  );
  const nfPendingDaysAfterPaid = Math.min(
    90,
    Math.max(1, Number(formData.get("nfPendingDaysAfterPaid") || 7) || 7),
  );

  await prisma.notificationSettings.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: entitlements.workspaceId,
        userId: session.id,
      },
    },
    create: {
      workspaceId: entitlements.workspaceId,
      userId: session.id,
      paymentDueSoon: formData.get("paymentDueSoon") === "on",
      paymentOverdue: formData.get("paymentOverdue") === "on",
      rubricNear: formData.get("rubricNear") === "on",
      nfPending: formData.get("nfPending") === "on",
      taxDueIss: formData.get("taxDueIss") === "on",
      taxDueFederal: formData.get("taxDueFederal") === "on",
      emailEnabled: formData.get("emailEnabled") === "on",
      dueSoonDaysAhead,
      nfPendingDaysAfterPaid,
    },
    update: {
      paymentDueSoon: formData.get("paymentDueSoon") === "on",
      paymentOverdue: formData.get("paymentOverdue") === "on",
      rubricNear: formData.get("rubricNear") === "on",
      nfPending: formData.get("nfPending") === "on",
      taxDueIss: formData.get("taxDueIss") === "on",
      taxDueFederal: formData.get("taxDueFederal") === "on",
      emailEnabled: formData.get("emailEnabled") === "on",
      dueSoonDaysAhead,
      nfPendingDaysAfterPaid,
    },
  });

  revalidatePath("/notificacoes");
  revalidatePath("/planejamento");
  return { ok: true };
}

const notificationRefreshAt = new Map<string, number>();
const NOTIFICATION_REFRESH_TTL_MS = 5 * 60 * 1000;

/**
 * Gera avisos de pagamento e rubrica quase esgotada.
 * Throttle por usuário/workspace (5 min), exceto `force`.
 * Chamar sob demanda (ex.: página /notificacoes), não no layout.
 */
export async function refreshPaymentDueNotifications(opts?: {
  force?: boolean;
}) {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const throttleKey = `${entitlements.workspaceId}:${session.id}`;
  const nowMs = Date.now();
  const last = notificationRefreshAt.get(throttleKey) ?? 0;
  if (!opts?.force && nowMs - last < NOTIFICATION_REFRESH_TTL_MS) {
    return;
  }
  notificationRefreshAt.set(throttleKey, nowMs);

  const prefs = await getNotificationPrefs(
    entitlements.workspaceId,
    session.id,
  );
  const now = new Date();

  if (prefs.paymentOverdue) {
    const overdue = await prisma.rubricCommitment.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        status: "RESERVED",
        expectedPayAt: { lt: now },
      },
      include: { planningProject: { select: { externalCode: true } } },
      take: 50,
    });

    for (const c of overdue) {
      // Não filtrar por readAt: marcar lido + refresh não deve recriar.
      const existing = await prisma.appNotification.findMany({
        where: {
          workspaceId: entitlements.workspaceId,
          type: "PAYMENT_OVERDUE",
          href: `/planejamento/compromissos/${c.id}`,
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (existing.length > 0) {
        if (existing.length > 1) {
          await prisma.appNotification.deleteMany({
            where: { id: { in: existing.slice(1).map((n) => n.id) } },
          });
        }
        continue;
      }
      const title = `Pagamento em atraso — ${c.planningProject.externalCode}`;
      const body = `Reserva de R$ ${Number(c.amount).toFixed(2)} venceu em ${c.expectedPayAt.toLocaleDateString("pt-BR")}`;
      const href = `/planejamento/compromissos/${c.id}`;
      await prisma.appNotification.create({
        data: {
          workspaceId: entitlements.workspaceId,
          userId: session.id,
          type: "PAYMENT_OVERDUE",
          title,
          body,
          href,
          meta: { commitmentId: c.id },
        },
      });
      if (prefs.emailEnabled && session.email) {
        await sendNotificationEmail({
          to: session.email,
          title,
          body,
          href,
        }).catch(() => false);
      }
    }
  }

  if (prefs.paymentDueSoon) {
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + prefs.dueSoonDaysAhead);

    const withReminder = await prisma.rubricCommitment.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        status: "RESERVED",
        paymentReminderAt: { lte: now },
      },
      include: { planningProject: { select: { externalCode: true } } },
      take: 50,
    });

    const legacy = await prisma.rubricCommitment.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        status: "RESERVED",
        paymentReminderAt: null,
        expectedPayAt: { gte: now, lte: horizon },
      },
      include: { planningProject: { select: { externalCode: true } } },
      take: 50,
    });

    const upcoming = [...withReminder, ...legacy];

    for (const c of upcoming) {
      const existing = await prisma.appNotification.findFirst({
        where: {
          workspaceId: entitlements.workspaceId,
          type: "PAYMENT_DUE_SOON",
          href: `/planejamento/compromissos/${c.id}`,
        },
        select: { id: true },
      });
      if (existing) continue;
      const title = `Pagamento previsto — ${c.planningProject.externalCode}`;
      const body = c.paymentReminderAt
        ? `Lembrete: reserva de R$ ${Number(c.amount).toFixed(2)} — pagamento até ${c.expectedPayAt.toLocaleDateString("pt-BR")}.`
        : `Reserva de R$ ${Number(c.amount).toFixed(2)} vence em ${c.expectedPayAt.toLocaleDateString("pt-BR")}`;
      const href = `/planejamento/compromissos/${c.id}`;
      await prisma.appNotification.create({
        data: {
          workspaceId: entitlements.workspaceId,
          userId: session.id,
          type: "PAYMENT_DUE_SOON",
          title,
          body,
          href,
          meta: {
            commitmentId: c.id,
            expectedPayAt: c.expectedPayAt.toISOString(),
            paymentReminderAt: c.paymentReminderAt?.toISOString(),
          },
        },
      });
      if (prefs.emailEnabled && session.email) {
        await sendNotificationEmail({
          to: session.email,
          title,
          body,
          href,
        }).catch(() => false);
      }
    }
  }

  if (prefs.rubricNear) {
    const projects = await prisma.planningProject.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        importedAt: { not: null },
        lifecycleStatus: "EM_ANDAMENTO",
      },
      include: {
        project: { select: { valorCaptado: true } },
        sheet: {
          include: {
            lines: {
              select: {
                id: true,
                approvedAmount: true,
                itemName: true,
                productName: true,
              },
            },
          },
        },
        commitments: {
          where: { status: { in: ["RESERVED", "PAID"] } },
          select: { budgetLineId: true, amount: true, status: true },
        },
      },
      take: 80,
    });

    const nearHrefs = new Set<string>();

    for (const p of projects) {
      if (!p.sheet) continue;
      const bal = computeProjectBalance({
        lines: p.sheet.lines,
        commitments: p.commitments,
        valorCaptado: p.project?.valorCaptado,
        captadoRecebido: p.captadoRecebido,
        captadoTransferido: p.captadoTransferido,
        rendimentos: p.rendimentos,
      });

      for (const line of p.sheet.lines) {
        const b = bal.lines.get(line.id);
        if (!b?.near) continue;
        const href = `/planejamento/${p.id}?near=${line.id}`;
        nearHrefs.add(href);
        const existing = await prisma.appNotification.findFirst({
          where: {
            workspaceId: entitlements.workspaceId,
            type: "RUBRIC_NEAR",
            href,
          },
          select: { id: true },
        });
        if (existing) continue;

        const pct = b.availableCap > 0
          ? Math.round((b.reserved / b.availableCap) * 100)
          : 100;
        const title = `Rubrica quase esgotada — ${p.externalCode}`;
        const body = `${line.itemName}: ${pct}% do disponível operacional reservado (resta R$ ${b.available.toFixed(2)})`;
        await prisma.appNotification.create({
          data: {
            workspaceId: entitlements.workspaceId,
            userId: session.id,
            type: "RUBRIC_NEAR",
            title,
            body,
            href,
            meta: {
              planningProjectId: p.id,
              budgetLineId: line.id,
            },
          },
        });
        if (prefs.emailEnabled && session.email) {
          await sendNotificationEmail({
            to: session.email,
            title,
            body,
            href,
          }).catch(() => false);
        }
      }
    }

    const stale = await prisma.appNotification.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        type: "RUBRIC_NEAR",
        OR: [{ userId: session.id }, { userId: null }],
      },
      select: { id: true, href: true },
    });
    const staleIds = stale
      .filter((n) => n.href && !nearHrefs.has(n.href))
      .map((n) => n.id);
    if (staleIds.length > 0) {
      await prisma.appNotification.deleteMany({
        where: { id: { in: staleIds } },
      });
    }
  }

  if (prefs.nfPending) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - prefs.nfPendingDaysAfterPaid);

    const withReminder = await prisma.rubricCommitment.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        status: "PAID",
        nfPending: true,
        nfReminderAt: { lte: now },
      },
      include: {
        planningProject: { select: { externalCode: true } },
        engagement: {
          select: {
            service: {
              select: { supplier: { select: { name: true } } },
            },
          },
        },
      },
      take: 50,
    });

    const legacy = await prisma.rubricCommitment.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        status: "PAID",
        nfPending: true,
        nfReminderAt: null,
        paidAt: { lte: cutoff },
      },
      include: {
        planningProject: { select: { externalCode: true } },
        engagement: {
          select: {
            service: {
              select: { supplier: { select: { name: true } } },
            },
          },
        },
      },
      take: 50,
    });

    const pendingNf = [...withReminder, ...legacy];

    for (const c of pendingNf) {
      const href = `/planejamento/compromissos/${c.id}`;
      const existing = await prisma.appNotification.findFirst({
        where: {
          workspaceId: entitlements.workspaceId,
          type: "NF_PENDING",
          href,
        },
        select: { id: true },
      });
      if (existing) continue;

      const supplier =
        c.engagement.service.supplier.name || "fornecedor";
      const title = `NF pendente — ${c.planningProject.externalCode}`;
      const body = c.nfReminderAt
        ? `Lembrete: anexar NF/RPA do pagamento de R$ ${Number(c.amount).toFixed(2)} para ${supplier}.`
        : `Pagamento de R$ ${Number(c.amount).toFixed(2)} para ${supplier} aguarda NF/RPA há mais de ${prefs.nfPendingDaysAfterPaid} dias.`;
      await prisma.appNotification.create({
        data: {
          workspaceId: entitlements.workspaceId,
          userId: session.id,
          type: "NF_PENDING",
          title,
          body,
          href,
          meta: {
            commitmentId: c.id,
            paidAt: c.paidAt?.toISOString(),
          },
        },
      });
      if (prefs.emailEnabled && session.email) {
        await sendNotificationEmail({
          to: session.email,
          title,
          body,
          href,
        }).catch(() => false);
      }
    }
  }
}

export async function loadRulesetsForWizard(jurisdiction: string) {
  return listPlanningRulesets(jurisdiction === "FEDERAL" ? "FEDERAL" : jurisdiction);
}

function money(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Redistribui approvedAmount entre linhas (ACL).
 * Cada linha: reserved ≤ value ≤ 2 × homologatedAmount.
 * Soma das linhas = totalApproved da planilha.
 */
export async function saveRubricReallocation(
  planningProjectId: string,
  values: Record<string, number>,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();

  if (!(await canExceedRubric())) {
    return {
      error:
        "Sem permissão para editar/exceder rubricas. Peça a tela «Exceder rubrica (Planejamento)» no MAX Cultural.",
    };
  }

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
    },
  });
  if (!project?.sheet) return { error: "Projeto sem planilha" };

  const balance = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
  });

  const target = Math.round(money(project.sheet.totalApproved) * 100) / 100;
  let sum = 0;
  const updates: Array<{ id: string; approvedAmount: number }> = [];

  for (const line of project.sheet.lines) {
    const raw = values[line.id];
    if (raw == null || !Number.isFinite(Number(raw))) {
      return { error: `Valor inválido para «${line.itemName}»` };
    }
    const value = Math.round(Number(raw) * 100) / 100;
    const homologated = money(line.homologatedAmount);
    const reserved = balance.lines.get(line.id)?.reserved ?? 0;
    const admin = isAdminProduct(line.productName);
    const max = admin
      ? Math.round(homologated * 100) / 100
      : Math.round(homologated * 2 * 100) / 100;

    if (admin && Math.abs(value - money(line.approvedAmount)) > 0.005) {
      return {
        error: `«${line.itemName}» (Administração) não pode ser excedida — mantenha ${money(line.approvedAmount).toFixed(2)}`,
      };
    }
    if (value < reserved - 0.005) {
      return {
        error: `«${line.itemName}» não pode ficar abaixo do reservado (${reserved.toFixed(2)})`,
      };
    }
    if (value > max + 0.005) {
      return {
        error: admin
          ? `«${line.itemName}» (Administração) não pode exceder o aprovado`
          : `«${line.itemName}» ultrapassa 2× o homologado (máx. ${max.toFixed(2)})`,
      };
    }
    sum += value;
    updates.push({ id: line.id, approvedAmount: value });
  }

  sum = Math.round(sum * 100) / 100;
  if (Math.abs(sum - target) > 0.005) {
    return {
      error: `A soma (${sum.toFixed(2)}) deve ser igual ao total aprovado do projeto (${target.toFixed(2)})`,
    };
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.projectBudgetLine.update({
        where: { id: u.id },
        data: { approvedAmount: u.approvedAmount },
      }),
    ),
  );

  revalidatePlanning(planningProjectId);
  return { ok: true };
}

/**
 * Espelha os projetos da Auditoria no Planejamento.
 * Para os em andamento sem planilha, vincula a planilha homologada pela área logada.
 */
export async function importAuditoriaProjectsToPlanning(): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();

  const rulesets = await listPlanningRulesets();
  const rulesetVersion = rulesets[0]?.version;
  if (!rulesetVersion) {
    return { error: "Nenhuma norma de conformidade ativa para vincular aos projetos." };
  }

  const auditProjects = await prisma.project.findMany({
    where: { salicAccount: { workspaceId: entitlements.workspaceId } },
    include: {
      planningProject: { select: { id: true } },
      salicAccount: { select: { id: true, name: true } },
    },
    orderBy: { pronac: "asc" },
  });

  let created = 0;
  let updated = 0;

  for (const p of auditProjects) {
    const lifecycle =
      p.lifecycleStatus === "ENCERRADO"
        ? "ENCERRADO"
        : classifyLifecycleFromSituacao(p.situacao);

    if (p.planningProject) {
      await prisma.planningProject.update({
        where: { id: p.planningProject.id },
        data: {
          lifecycleStatus: lifecycle,
          name: p.name || undefined,
        },
      });
      if (p.lifecycleStatus !== lifecycle) {
        await prisma.project.update({
          where: { id: p.id },
          data: { lifecycleStatus: lifecycle },
        });
      }
      updated += 1;
      await syncFluxoProjeto({
        pronac: p.pronac,
        nome: p.name || p.pronac,
        proponente: p.salicAccount.name,
        bulk: true,
      });
      continue;
    }

    await prisma.planningProject.create({
      data: {
        workspaceId: entitlements.workspaceId,
        accountId: p.salicAccountId,
        jurisdiction: "FEDERAL",
        rulesetVersion,
        externalCode: p.pronac,
        name: p.name,
        projectId: p.id,
        lifecycleStatus: lifecycle,
      },
    });
    created += 1;
    await syncFluxoProjeto({
      pronac: p.pronac,
      nome: p.name || p.pronac,
      proponente: p.salicAccount.name,
      bulk: true,
    });
  }

  const sheets = await linkHomologatedSheetsForOpenProjects(entitlements.workspaceId);

  revalidatePlanning();
  return {
    ok: true,
    id: `${created}:${updated}:${sheets.linked}:${sheets.skipped}`,
    error:
      sheets.errors.length > 0
        ? sheets.errors.slice(0, 5).join(" · ") +
          (sheets.errors.length > 5 ? ` · (+${sheets.errors.length - 5})` : "")
        : undefined,
  };
}

function normalizeConfirmName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Confirmação escrita + inicia contagem regressiva de 10s (status AGUARDANDO). */
export async function beginSalicPublishCountdown(
  planningProjectId: string,
  typedName: string,
): Promise<ActionState> {
  await requireUser();
  if (!(await canPublishToSalic())) {
    return { error: "Sem permissão para enviar projetos ao SALIC." };
  }
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { select: { id: true } },
      documents: { select: { kind: true, status: true } },
      commitments: { select: { status: true } },
    },
  });
  if (!project) return { error: "Projeto não encontrado." };

  if (
    project.salicPublishStatus === "AGUARDANDO" ||
    project.salicPublishStatus === "ENVIANDO"
  ) {
    return { error: "Já existe um envio em andamento para este projeto." };
  }

  const expected = normalizeConfirmName(project.name || project.externalCode);
  const got = normalizeConfirmName(typedName);
  if (!expected || got !== expected) {
    return {
      error: "O nome digitado não confere com o nome do projeto. Digite exatamente como aparece.",
    };
  }

  const readiness = assessSalicPublishReadiness({
    hasSheet: Boolean(project.sheet),
    documents: project.documents,
    commitments: project.commitments,
  });
  if (!readiness.ok) {
    return { error: readiness.reasons[0] || "Projeto ainda não está pronto para envio." };
  }

  await prisma.planningProject.update({
    where: { id: project.id },
    data: {
      salicPublishStatus: "AGUARDANDO",
      salicPublishMessage: "Confirmação recebida. Aguarde 10 segundos para o envio começar.",
      salicPublishStartedAt: new Date(),
      salicPublishCancelRequested: false,
    },
  });

  revalidatePlanning(project.id);
  return { ok: true };
}

/** Após a contagem: inicia o envio (área logada). Pode ser cancelado. */
export async function startSalicPublishUpload(
  planningProjectId: string,
): Promise<ActionState> {
  await requireUser();
  if (!(await canPublishToSalic())) {
    return { error: "Sem permissão para enviar projetos ao SALIC." };
  }
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      documents: {
        where: { status: "IMPORTED" },
        orderBy: { createdAt: "asc" },
        select: { id: true, kind: true, filename: true },
      },
    },
  });
  if (!project) return { error: "Projeto não encontrado." };

  if (project.salicPublishStatus !== "AGUARDANDO") {
    return { error: "O envio precisa da confirmação e da contagem de 10 segundos." };
  }

  if (project.salicPublishCancelRequested) {
    await prisma.planningProject.update({
      where: { id: project.id },
      data: {
        salicPublishStatus: "CANCELADO",
        salicPublishMessage: "Envio cancelado antes de começar.",
        salicPublishCancelRequested: false,
      },
    });
    revalidatePlanning(project.id);
    return { error: "Envio cancelado." };
  }

  const startedAt = project.salicPublishStartedAt?.getTime() ?? 0;
  if (Date.now() - startedAt < 9500) {
    return { error: "Aguarde o fim da contagem de 10 segundos." };
  }

  await prisma.planningProject.update({
    where: { id: project.id },
    data: {
      salicPublishStatus: "ENVIANDO",
      salicPublishMessage: "Preparando documentos para a área logada do SALIC…",
      salicPublishStartedAt: new Date(),
      salicPublishCancelRequested: false,
    },
  });
  revalidatePlanning(project.id);

  // Envio real via área logada: processa documentos com checagem de cancelamento.
  // Enquanto o robô de upload no SALIC não estiver completo, registra a fila e conclui
  // com mensagem clara — os arquivos já ficam guardados no Origem.
  try {
    const docs = project.documents;
    for (let i = 0; i < docs.length; i++) {
      const row = await prisma.planningProject.findUnique({
        where: { id: project.id },
        select: { salicPublishCancelRequested: true },
      });
      if (row?.salicPublishCancelRequested) {
        await prisma.planningProject.update({
          where: { id: project.id },
          data: {
            salicPublishStatus: "CANCELADO",
            salicPublishMessage: `Envio cancelado (${i}/${docs.length} documentos).`,
            salicPublishCancelRequested: false,
          },
        });
        revalidatePlanning(project.id);
        return { error: "Envio cancelado." };
      }

      const doc = docs[i]!;
      const label =
        doc.kind === "NF"
          ? "nota fiscal"
          : doc.kind === "PAYMENT_PROOF"
            ? "comprovante de pagamento"
            : "comprovante fiscal";
      await prisma.planningProject.update({
        where: { id: project.id },
        data: {
          salicPublishMessage: `Fila ${i + 1}/${docs.length}: ${label}${
            doc.filename ? ` (${doc.filename})` : ""
          }`,
        },
      });
      await new Promise((r) => setTimeout(r, 400));
    }

    await prisma.planningProject.update({
      where: { id: project.id },
      data: {
        salicPublishStatus: "CONCLUIDO",
        salicPublishMessage:
          "Documentos organizados na fila de envio. O depósito automático na área logada do SALIC será concluído nesta etapa nas próximas versões; os arquivos já estão guardados no Origem.",
        salicPublishCancelRequested: false,
      },
    });
    revalidatePlanning(project.id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no envio";
    await prisma.planningProject.update({
      where: { id: project.id },
      data: {
        salicPublishStatus: "FALHOU",
        salicPublishMessage: msg,
        salicPublishCancelRequested: false,
      },
    });
    revalidatePlanning(project.id);
    return { error: msg };
  }
}

export async function cancelSalicPublish(
  planningProjectId: string,
): Promise<ActionState> {
  await requireUser();
  if (!(await canPublishToSalic())) {
    return { error: "Sem permissão para cancelar o envio." };
  }
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    select: { id: true, salicPublishStatus: true },
  });
  if (!project) return { error: "Projeto não encontrado." };

  if (
    project.salicPublishStatus !== "AGUARDANDO" &&
    project.salicPublishStatus !== "ENVIANDO"
  ) {
    return { error: "Não há envio em andamento para cancelar." };
  }

  if (project.salicPublishStatus === "AGUARDANDO") {
    await prisma.planningProject.update({
      where: { id: project.id },
      data: {
        salicPublishStatus: "CANCELADO",
        salicPublishMessage: "Envio cancelado na contagem regressiva.",
        salicPublishCancelRequested: false,
      },
    });
  } else {
    await prisma.planningProject.update({
      where: { id: project.id },
      data: {
        salicPublishCancelRequested: true,
        salicPublishMessage: "Cancelamento solicitado…",
      },
    });
  }

  revalidatePlanning(project.id);
  return { ok: true };
}


// ——— Readequação ———

async function expireOpenDrafts(planningProjectId: string, workspaceId: string) {
  const now = new Date();
  await prisma.planningReadequacaoDraft.updateMany({
    where: {
      planningProjectId,
      workspaceId,
      status: "OPEN",
      expiresAt: { lt: now },
    },
    data: { status: "EXPIRED" },
  });
}

export async function startReadequacaoDraft(
  planningProjectId: string,
): Promise<ActionState> {
  const session = await requireUser();
  if (!(await canReadequacao())) {
    return { error: "Sem permissão para Readequação." };
  }
  const { entitlements } = await getWorkspaceContext();
  await expireOpenDrafts(planningProjectId, entitlements.workspaceId);

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      project: { select: { valorCaptado: true } },
    },
  });
  if (!project?.sheet) return { error: "Projeto sem planilha" };

  await prisma.planningReadequacaoDraft.updateMany({
    where: {
      planningProjectId,
      workspaceId: entitlements.workspaceId,
      status: "OPEN",
    },
    data: { status: "EXPIRED" },
  });

  const snap = snapshotFromProject({
    lines: project.sheet.lines,
    totalApproved: project.sheet.totalApproved,
    valorCaptado: project.project?.valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
    sourceFilename: project.sheet.sourceFilename,
    importedAt: project.sheet.importedAt,
  });

  const draft = await prisma.planningReadequacaoDraft.create({
    data: {
      planningProjectId,
      workspaceId: entitlements.workspaceId,
      createdById: session.id,
      source: "MANUAL",
      status: "OPEN",
      snapshotJson: snap as object,
      expiresAt: new Date(Date.now() + READEQUACAO_TTL_MS),
    },
  });

  revalidatePlanning(planningProjectId);
  redirect(`/planejamento/${planningProjectId}/readequacao/${draft.id}`);
}

export async function startReadequacaoFromSalic(
  planningProjectId: string,
): Promise<ActionState> {
  await requireUser();
  if (!(await canReadequacao())) {
    return { error: "Sem permissão para Readequação." };
  }
  const { entitlements } = await getWorkspaceContext();
  await expireOpenDrafts(planningProjectId, entitlements.workspaceId);

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true },
      },
    },
  });
  if (!project?.sheet) return { error: "Projeto sem planilha" };
  if (project.jurisdiction !== "FEDERAL") {
    return { error: "Readequar com SALIC disponível só para projetos federais." };
  }

  let linesFromSalic;
  try {
    linesFromSalic = await fetchReadequadaLinesFromSalic({
      accountId: project.accountId,
      pronac: project.externalCode,
    });
  } catch (e) {
    return {
      error:
        e instanceof HomologadaImportError
          ? e.message
          : "Falha ao buscar planilha readequada no SALIC",
    };
  }

  const reservedByLine = new Map<string, number>();
  for (const c of project.commitments) {
    reservedByLine.set(
      c.budgetLineId,
      (reservedByLine.get(c.budgetLineId) || 0) + moneyN(c.amount),
    );
  }

  const existingByAprovacaoId = new Map(
    project.sheet.lines
      .filter((l) => l.planilhaAprovacaoId)
      .map((l) => [String(l.planilhaAprovacaoId).trim(), l] as const),
  );
  const existingByComposite = new Map(
    project.sheet.lines.map(
      (l) =>
        [
          budgetLineIdentityKey({ ...l, planilhaAprovacaoId: null }),
          l,
        ] as const,
    ),
  );

  function matchExisting(salic: (typeof linesFromSalic)[number]) {
    const byId = salic.planilhaAprovacaoId
      ? existingByAprovacaoId.get(String(salic.planilhaAprovacaoId).trim())
      : undefined;
    if (byId) return byId;
    return existingByComposite.get(
      budgetLineIdentityKey({ ...salic, planilhaAprovacaoId: null }),
    );
  }

  for (const salic of linesFromSalic) {
    const existing = matchExisting(salic);
    if (!existing) continue;
    const reserved = reservedByLine.get(existing.id) || 0;
    if (reserved > moneyN(salic.approvedAmount) + 1e-6) {
      return {
        error: `${existing.itemName}: readequação (R$ ${moneyN(salic.approvedAmount).toFixed(2)}) é menor que o reservado/pago (R$ ${reserved.toFixed(2)}).`,
      };
    }
  }

  const matchedExistingIds = new Set(
    linesFromSalic
      .map((l) => matchExisting(l)?.id)
      .filter((id): id is string => Boolean(id)),
  );
  for (const line of project.sheet.lines) {
    if (matchedExistingIds.has(line.id)) continue;
    const reserved = reservedByLine.get(line.id) || 0;
    if (reserved > 0) {
      return {
        error: `${line.itemName}: sumiu na readequação do SALIC, mas ainda tem R$ ${reserved.toFixed(2)} reservado/pago. Ajuste as reservas antes de importar.`,
      };
    }
  }

  const now = new Date();
  const sheetId = project.sheet.id;

  await prisma.$transaction(async (tx) => {
    await tx.planningReadequacaoDraft.updateMany({
      where: {
        planningProjectId,
        workspaceId: entitlements.workspaceId,
        status: "OPEN",
      },
      data: { status: "EXPIRED" },
    });

    const keepIds = new Set<string>();
    let sortOrder = 0;
    let totalApproved = 0;

    for (const l of linesFromSalic) {
      const existing = matchExisting(l);
      const amount = moneyN(l.approvedAmount);
      totalApproved += amount;

      if (existing) {
        await tx.projectBudgetLine.update({
          where: { id: existing.id },
          data: {
            planilhaAprovacaoId: l.planilhaAprovacaoId,
            fonteRecurso: l.fonteRecurso,
            productName: l.productName,
            stageName: l.stageName,
            state: l.state,
            city: l.city,
            itemName: l.itemName,
            categoryHint: l.categoryHint,
            unit: l.unit || "Unidade",
            days: l.days || 1,
            quantity: l.quantity || 1,
            occurrences: l.occurrences || 1,
            unitPrice: l.unitPrice || 0,
            homologatedAmount: amount,
            approvedAmount: amount,
            salicComprovado: l.salicComprovado,
            sortOrder,
          },
        });
        keepIds.add(existing.id);
      } else {
        await tx.projectBudgetLine.create({
          data: {
            sheetId,
            planilhaAprovacaoId: l.planilhaAprovacaoId,
            fonteRecurso: l.fonteRecurso,
            productName: l.productName,
            stageName: l.stageName,
            state: l.state,
            city: l.city,
            itemName: l.itemName,
            categoryHint: l.categoryHint,
            unit: l.unit || "Unidade",
            days: l.days || 1,
            quantity: l.quantity || 1,
            occurrences: l.occurrences || 1,
            unitPrice: l.unitPrice || 0,
            homologatedAmount: amount,
            approvedAmount: amount,
            salicComprovado: l.salicComprovado,
            sortOrder,
          },
        });
      }
      sortOrder += 1;
    }

    const staleIds = project.sheet!.lines
      .filter((l) => !keepIds.has(l.id))
      .map((l) => l.id);
    if (staleIds.length > 0) {
      await tx.projectBudgetLine.deleteMany({
        where: { id: { in: staleIds }, sheetId },
      });
    }

    totalApproved = Math.round(totalApproved * 100) / 100;

    await tx.projectBudgetSheet.update({
      where: { id: sheetId },
      data: {
        totalApproved,
        importedAt: now,
        sourceFilename: "SALIC planilha readequada",
        available: true,
      },
    });

    await tx.planningProject.update({
      where: { id: planningProjectId },
      data: {
        importedAt: now,
        importSource: "SALIC_READEQUADA",
      },
    });
  });

  revalidatePlanning(planningProjectId);
  redirect(`/planejamento/${planningProjectId}`);
}

export async function saveReadequacaoDraft(
  draftId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  if (!(await canReadequacao())) return { error: "Sem permissão." };
  const { entitlements } = await getWorkspaceContext();

  const draft = await prisma.planningReadequacaoDraft.findFirst({
    where: { id: draftId, workspaceId: entitlements.workspaceId },
  });
  if (!draft) return { error: "Rascunho não encontrado" };
  if (draft.status !== "OPEN" || draft.expiresAt < new Date()) {
    await prisma.planningReadequacaoDraft.update({
      where: { id: draftId },
      data: { status: "EXPIRED" },
    });
    return { error: "Rascunho expirado (24h)." };
  }

  let snap: ReadequacaoSnapshot;
  try {
    snap = JSON.parse(String(formData.get("snapshotJson") || "{}")) as ReadequacaoSnapshot;
  } catch {
    return { error: "Snapshot inválido" };
  }
  if (!Array.isArray(snap.lines)) return { error: "Linhas inválidas" };

  const project = await prisma.planningProject.findFirst({
    where: {
      id: draft.planningProjectId,
      workspaceId: entitlements.workspaceId,
    },
    include: {
      sheet: { include: { lines: { select: { id: true } } } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true },
      },
    },
  });
  if (!project?.sheet) return { error: "Projeto sem planilha" };

  const sheetLineIds = new Set(project.sheet.lines.map((l) => l.id));
  const reservedByLine = new Map<string, number>();
  for (const c of project.commitments) {
    reservedByLine.set(
      c.budgetLineId,
      (reservedByLine.get(c.budgetLineId) || 0) + moneyN(c.amount),
    );
  }

  const validated = validateReadequacaoSnapshot({
    lines: snap.lines,
    sheetLineIds,
    reservedByLine,
  });
  if (!validated.ok) return { error: validated.error };

  // Homologado e aprovado são o mesmo valor na readequação.
  snap.lines = snap.lines.map((l) => {
    const amount = moneyN(l.approvedAmount);
    return { ...l, approvedAmount: amount, homologatedAmount: amount };
  });
  snap.totalApproved =
    Math.round(snap.lines.reduce((s, l) => s + l.approvedAmount, 0) * 100) / 100;

  await prisma.planningReadequacaoDraft.update({
    where: { id: draftId },
    data: { snapshotJson: snap as object },
  });
  revalidatePath(`/planejamento/${draft.planningProjectId}/readequacao/${draftId}`);
  return { ok: true };
}

export async function applyReadequacaoDraft(draftId: string): Promise<ActionState> {
  await requireUser();
  if (!(await canReadequacao())) return { error: "Sem permissão." };
  const { entitlements } = await getWorkspaceContext();

  const draft = await prisma.planningReadequacaoDraft.findFirst({
    where: { id: draftId, workspaceId: entitlements.workspaceId },
  });
  if (!draft) return { error: "Rascunho não encontrado" };
  if (draft.status === "APPLIED") {
    return { error: "Rascunho já aplicado." };
  }
  if (draft.status !== "OPEN" && draft.status !== "EXPORTED") {
    return { error: "Rascunho não está aberto para aplicação." };
  }
  if (draft.expiresAt < new Date()) {
    await prisma.planningReadequacaoDraft.update({
      where: { id: draftId },
      data: { status: "EXPIRED" },
    });
    return { error: "Rascunho expirado." };
  }

  const snap = draft.snapshotJson as unknown as ReadequacaoSnapshot;
  if (!Array.isArray(snap?.lines)) return { error: "Snapshot inválido" };

  const project = await prisma.planningProject.findFirst({
    where: {
      id: draft.planningProjectId,
      workspaceId: entitlements.workspaceId,
    },
    include: {
      sheet: { include: { lines: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true },
      },
    },
  });
  if (!project?.sheet) return { error: "Projeto sem planilha" };

  const sheetLineIds = new Set(project.sheet.lines.map((l) => l.id));
  const reservedByLine = new Map<string, number>();
  for (const c of project.commitments) {
    reservedByLine.set(
      c.budgetLineId,
      (reservedByLine.get(c.budgetLineId) || 0) + moneyN(c.amount),
    );
  }

  const validated = validateReadequacaoSnapshot({
    lines: snap.lines,
    sheetLineIds,
    reservedByLine,
  });
  if (!validated.ok) return { error: validated.error };

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.planningReadequacaoDraft.updateMany({
        where: {
          id: draftId,
          workspaceId: entitlements.workspaceId,
          status: { in: ["OPEN", "EXPORTED"] },
        },
        data: { status: "APPLIED" },
      });
      if (claimed.count !== 1) {
        throw new Error("DRAFT_ALREADY_APPLIED");
      }

      for (const line of snap.lines) {
        if (String(line.id).startsWith("new-")) {
          const amount = moneyN(line.approvedAmount);
          await tx.projectBudgetLine.create({
            data: {
              sheetId: project.sheet!.id,
              fonteRecurso: line.fonteRecurso,
              productName: line.productName,
              stageName: line.stageName,
              state: line.state,
              city: line.city,
              itemName: line.itemName,
              categoryHint: line.categoryHint,
              unit: line.unit,
              days: line.days,
              quantity: line.quantity,
              occurrences: line.occurrences,
              unitPrice: line.unitPrice,
              homologatedAmount: amount,
              approvedAmount: amount,
              salicComprovado: line.salicComprovado,
              sortOrder: line.sortOrder,
            },
          });
          continue;
        }
        const amount = moneyN(line.approvedAmount);
        await tx.projectBudgetLine.updateMany({
          where: { id: line.id, sheetId: project.sheet!.id },
          data: {
            approvedAmount: amount,
            homologatedAmount: amount,
          },
        });
      }

      const totalApproved =
        Math.round(
          snap.lines.reduce((s, l) => s + moneyN(l.approvedAmount), 0) * 100,
        ) / 100;

      await tx.projectBudgetSheet.update({
        where: { id: project.sheet!.id },
        data: { totalApproved },
      });

      await tx.planningProject.update({
        where: { id: project.id },
        data: {
          captadoRecebido: snap.captadoRecebido,
          captadoTransferido: snap.captadoTransferido,
          rendimentos: snap.rendimentos,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DRAFT_ALREADY_APPLIED") {
      return { error: "Rascunho já aplicado." };
    }
    throw err;
  }

  revalidatePlanning(project.id);
  redirect(`/planejamento/${project.id}`);
}

void exportReadequacaoCsv;
