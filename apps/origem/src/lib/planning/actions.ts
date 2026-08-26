"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { normalizeCgccpf } from "@/lib/format";
import { canExceedRubric, canPublishToSalic } from "@/lib/planning/acl";
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
  fetchSalicProjectPreview,
  HomologadaImportError,
  linkHomologatedSheetsForOpenProjects,
  persistHomologatedSheet,
} from "@/lib/planning/import-homologada";
import { parseStateHomologatedFile } from "@/lib/planning/state-file";
import {
  canReserveAmount,
  computeProjectBalance,
} from "@/lib/planning/rubric-balance";
import { fifthBusinessDayNextMonth } from "@/lib/planning/business-days";
import { extractNfFromBuffer } from "@/lib/nf/extract";
import { storeCompressedDocument } from "@/lib/nf/compress";
import {
  extractPaymentDetails,
  mergePaymentDetails,
} from "@/lib/nf/payment-details";
import { lookupCnpj } from "@/lib/catalog/brasil-api";
import { normalizeCnaeCode } from "@/lib/catalog/cnae";
import { evaluateSupplierLimit } from "@/lib/compliance/rouanet";
import { toActiveRules } from "@/lib/compliance/rules";

export type ActionState = { error?: string; ok?: boolean; id?: string };

function revalidatePlanning(id?: string) {
  revalidatePath("/planejamento");
  revalidatePath("/planejamento/buscar");
  revalidatePath("/fornecedores");
  revalidatePath("/fornecedores/contratacoes");
  if (id) {
    revalidatePath(`/planejamento/${id}`);
    revalidatePath(`/planejamento/${id}/nf/nova`);
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

export async function uploadNfForReview(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const file = formData.get("nfFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione a NF (PDF ou XML)" };
  }

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
  });
  if (!project?.importedAt) return { error: "Projeto sem planilha importada" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeCompressedDocument({
    buffer,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
  });
  const extracted = await extractNfFromBuffer({
    buffer,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
  });

  const doc = await prisma.planningDocument.create({
    data: {
      kind: "NF",
      status: "REVIEW",
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      storagePath: stored.storagePath,
      byteSize: stored.byteSize,
      originalByteSize: stored.originalByteSize,
      extractedJson: extracted as object,
      workspaceId: entitlements.workspaceId,
      planningProjectId,
    },
  });

  revalidatePlanning(planningProjectId);
  redirect(`/planejamento/${planningProjectId}/nf/${doc.id}/revisar`);
}

export async function confirmNfReservation(
  documentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();

  const budgetLineId = String(formData.get("budgetLineId") || "");
  const hasBond = formData.get("hasBond") === "on" || formData.get("hasBond") === "true";
  const amountRaw = String(formData.get("amount") || "").replace(",", ".");
  const amount = Number(amountRaw);
  const serviceName = String(formData.get("serviceName") || "").trim();
  const supplierName = String(formData.get("supplierName") || "").trim();
  const cnpj = normalizeCgccpf(String(formData.get("cnpj") || ""));
  const hiredAtRaw = String(formData.get("hiredAt") || "");
  let cnaeCode = normalizeCnaeCode(String(formData.get("cnaeCode") || ""));
  let cnaeDescription = String(formData.get("cnaeDescription") || "").trim() || null;
  const paymentFromForm = {
    pixKey: String(formData.get("pixKey") || "").trim() || null,
    bankName: String(formData.get("bankName") || "").trim() || null,
    bankAgency: String(formData.get("bankAgency") || "").trim() || null,
    bankAccount: String(formData.get("bankAccount") || "").trim() || null,
    paymentNotes: String(formData.get("paymentNotes") || "").trim() || null,
  };

  const doc = await prisma.planningDocument.findFirst({
    where: { id: documentId, workspaceId: entitlements.workspaceId, kind: "NF" },
  });
  if (!doc?.planningProjectId) return { error: "Documento inválido" };

  const project = await prisma.planningProject.findFirst({
    where: { id: doc.planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: true } },
      commitments: { where: { status: { in: ["RESERVED", "PAID"] } } },
      ruleset: true,
    },
  });
  if (!project?.sheet) return { error: "Projeto sem planilha" };
  if (!budgetLineId || !cnpj || !supplierName || !serviceName || !(amount > 0)) {
    return { error: "Preencha fornecedor, serviço, rubrica e valor" };
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

  const balance = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
  });
  const check = canReserveAmount({
    lineId: budgetLineId,
    amount,
    balance,
    allowOverflow: false,
  });
  if (!check.ok) return { error: check.message };

  const rules = toActiveRules(project.ruleset);
  const valorCaptado =
    (project.projectId
      ? await prisma.project
          .findUnique({ where: { id: project.projectId } })
          .then((p) => (p?.valorCaptado != null ? Number(p.valorCaptado) : null))
      : null) || Number(project.sheet.totalApproved);

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
    projectTotal: valorCaptado,
    supplierName,
    supplierCgccpf: cnpj,
    amount: priorSum + amount,
    accountCgccpf: (
      await prisma.salicAccount.findUnique({ where: { id: project.accountId } })
    )?.cgccpf,
    rules,
  });
  if (supplierAlert?.level === "critical") {
    return { error: supplierAlert.title };
  }

  const hiredAt = hiredAtRaw ? new Date(hiredAtRaw) : new Date();
  const expectedPayAt = fifthBusinessDayNextMonth(hiredAt);

  const result = await prisma.$transaction(async (tx) => {
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
            project.sheet!.lines.find((l) => l.id === budgetLineId)?.categoryHint ||
            "outros",
        },
      });
    }

    const engagement = await tx.catalogEngagement.create({
      data: {
        workspaceId: entitlements.workspaceId,
        serviceId: service.id,
        price: amount,
        unitPrice: amount,
        quantity: 1,
        priceUnit: "closed",
        hiredAt,
        source: "PLANNING_NF",
        planningProjectId: project.id,
        budgetLineId,
        notes: `NF ${doc.filename}`,
      },
    });

    const commitment = await tx.rubricCommitment.create({
      data: {
        budgetLineId,
        planningProjectId: project.id,
        workspaceId: entitlements.workspaceId,
        engagementId: engagement.id,
        amount,
        status: "RESERVED",
        hasBond,
        expectedPayAt,
        createdById: session.id,
      },
    });

    await tx.planningDocument.update({
      where: { id: doc.id },
      data: {
        status: "IMPORTED",
        engagementId: engagement.id,
        commitmentId: commitment.id,
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

    // Notificação de vencimento futuro (lembrete)
    await tx.appNotification.create({
      data: {
        workspaceId: entitlements.workspaceId,
        userId: session.id,
        type: "PAYMENT_DUE_SOON",
        title: `Pagamento previsto — ${project.externalCode}`,
        body: `NF de R$ ${amount.toFixed(2)} com vencimento em ${expectedPayAt.toLocaleDateString("pt-BR")}`,
        href: `/planejamento/compromissos/${commitment.id}`,
        meta: { commitmentId: commitment.id, expectedPayAt: expectedPayAt.toISOString() },
      },
    });

    return commitment;
  });

  revalidatePlanning(project.id);
  redirect(`/planejamento/compromissos/${result.id}`);
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
  const file = formData.get("proofFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o arquivo" };
  }

  const commitment = await prisma.rubricCommitment.findFirst({
    where: { id: commitmentId, workspaceId: entitlements.workspaceId },
  });
  if (!commitment) return { error: "Compromisso não encontrado" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeCompressedDocument({
    buffer,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
  });

  await prisma.planningDocument.create({
    data: {
      kind,
      status: "IMPORTED",
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      storagePath: stored.storagePath,
      byteSize: stored.byteSize,
      originalByteSize: stored.originalByteSize,
      workspaceId: entitlements.workspaceId,
      planningProjectId: commitment.planningProjectId,
      engagementId: commitment.engagementId,
      commitmentId: commitment.id,
    },
  });

  if (kind === "PAYMENT_PROOF") {
    await prisma.rubricCommitment.update({
      where: { id: commitment.id },
      data: { status: "PAID", paidAt: new Date() },
    });
  }

  revalidatePlanning(commitment.planningProjectId);
  revalidatePath(`/planejamento/compromissos/${commitmentId}`);
  return { ok: true };
}

/** Anexa NF ou comprovante a uma contratação (com ou sem compromisso de planejamento). */
export async function linkEngagementDocument(
  engagementId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const kind = String(formData.get("kind") || "") as "NF" | "PAYMENT_PROOF";
  if (kind !== "NF" && kind !== "PAYMENT_PROOF") {
    return { error: "Tipo de documento inválido" };
  }
  const file = formData.get("docFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o arquivo" };
  }

  const engagement = await prisma.catalogEngagement.findFirst({
    where: { id: engagementId, workspaceId: entitlements.workspaceId },
    include: { commitment: true },
  });
  if (!engagement) return { error: "Contratação não encontrada" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeCompressedDocument({
    buffer,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
  });

  let extractedJson: object | undefined;
  if (kind === "NF") {
    try {
      const extracted = await extractNfFromBuffer({
        buffer,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
      });
      extractedJson = extracted as object;
    } catch {
      extractedJson = undefined;
    }
  }

  await prisma.planningDocument.create({
    data: {
      kind,
      status: "IMPORTED",
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      storagePath: stored.storagePath,
      byteSize: stored.byteSize,
      originalByteSize: stored.originalByteSize,
      extractedJson: extractedJson ?? undefined,
      workspaceId: entitlements.workspaceId,
      planningProjectId: engagement.planningProjectId,
      engagementId: engagement.id,
      commitmentId: engagement.commitment?.id,
    },
  });

  if (kind === "PAYMENT_PROOF" && engagement.commitment) {
    await prisma.rubricCommitment.update({
      where: { id: engagement.commitment.id },
      data: { status: "PAID", paidAt: new Date() },
    });
  }

  revalidatePlanning(engagement.planningProjectId || undefined);
  revalidatePath("/fornecedores/contratacoes");
  if (engagement.commitment) {
    revalidatePath(`/planejamento/compromissos/${engagement.commitment.id}`);
  }
  return { ok: true };
}

export async function markNotificationRead(id: string) {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  await prisma.appNotification.updateMany({
    where: { id, workspaceId: entitlements.workspaceId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/planejamento");
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
}

/** Gera notificações de atraso para commitments RESERVED vencidos. */
export async function refreshPaymentDueNotifications() {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const now = new Date();
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
    const exists = await prisma.appNotification.findFirst({
      where: {
        workspaceId: entitlements.workspaceId,
        type: "PAYMENT_OVERDUE",
        href: `/planejamento/compromissos/${c.id}`,
        readAt: null,
      },
    });
    if (exists) continue;
    await prisma.appNotification.create({
      data: {
        workspaceId: entitlements.workspaceId,
        userId: session.id,
        type: "PAYMENT_OVERDUE",
        title: `Pagamento em atraso — ${c.planningProject.externalCode}`,
        body: `Reserva de R$ ${Number(c.amount).toFixed(2)} venceu em ${c.expectedPayAt.toLocaleDateString("pt-BR")}`,
        href: `/planejamento/compromissos/${c.id}`,
        meta: { commitmentId: c.id },
      },
    });
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
    const max = Math.round(homologated * 2 * 100) / 100;

    if (value < reserved - 0.005) {
      return {
        error: `«${line.itemName}» não pode ficar abaixo do reservado (${reserved.toFixed(2)})`,
      };
    }
    if (value > max + 0.005) {
      return {
        error: `«${line.itemName}» ultrapassa 2× o homologado (máx. ${max.toFixed(2)})`,
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

