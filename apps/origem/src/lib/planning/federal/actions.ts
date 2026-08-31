"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { canPublishToSalic, canReadequacao } from "@/lib/planning/acl";
import {
  classifyLifecycleFromSituacao,
  isFederalPlanning,
} from "@/lib/planning/lifecycle";
import { listPlanningRulesets } from "@/lib/planning/rulesets";
import {
  resolveFluxoContexto,
  type FluxoContextResolve,
} from "@/lib/fluxo/provision-projeto";
import {
  fetchHomologatedLinesFromSalic,
  fetchReadequadaLinesFromSalic,
  fetchSalicProjectPreview,
  HomologadaImportError,
  linkHomologatedSheetsForOpenProjects,
  persistHomologatedSheet,
} from "@/lib/planning/federal/import-homologada";
import {
  applyCaptacaoToPlanningProject,
  CaptacaoImportError,
  fetchCaptacaoFromSalic,
  syncCaptacaoForWorkspace,
} from "@/lib/planning/federal/captacao-salic";
import {
  revalidatePlanning,
  readFluxoContextFromForm,
  syncFluxoProjeto,
} from "@/lib/planning/server-utils";
import {
  buildSalicPublishPackages,
  executeSalicPublishPackage,
  loadSalicPublishDocs,
  publishSalicPackages,
} from "@/lib/planning/federal/salic-publish";
import { assessSalicPublishReadiness } from "@/lib/planning/federal/salic-readiness";
import {
  budgetLineIdentityKey,
  expireOpenReadequacaoDrafts,
  moneyN,
} from "@/lib/planning/readequacao";
import type { ActionState } from "@/lib/planning/action-state";

function federalSalicOnlyError(): ActionState {
  return {
    error: "Integração SALIC disponível só para projetos federais (Lei Rouanet).",
  };
}

function normalizeConfirmName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

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
      commitments: { select: { status: true, nfPending: true } },
    },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!isFederalPlanning(project.jurisdiction)) return federalSalicOnlyError();

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
        select: {
          id: true,
          kind: true,
          status: true,
          filename: true,
          mimeType: true,
          storagePath: true,
          sourceDocumentId: true,
          salicComprovanteId: true,
          salicPublishMode: true,
          salicRepublishPending: true,
        },
      },
    },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!isFederalPlanning(project.jurisdiction)) return federalSalicOnlyError();

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

  // Envio via área logada do SALIC (Playwright + REST gerenciar/cadastrar).
  try {
    const packages = buildSalicPublishPackages(project.documents);
    if (packages.length === 0) {
      throw new Error("Nenhum comprovante pronto para envio ao SALIC.");
    }

    for (let i = 0; i < packages.length; i++) {
      const row = await prisma.planningProject.findUnique({
        where: { id: project.id },
        select: { salicPublishCancelRequested: true },
      });
      if (row?.salicPublishCancelRequested) {
        await prisma.planningProject.update({
          where: { id: project.id },
          data: {
            salicPublishStatus: "CANCELADO",
            salicPublishMessage: `Envio cancelado (${i}/${packages.length} pacotes).`,
            salicPublishCancelRequested: false,
          },
        });
        revalidatePlanning(project.id);
        return { error: "Envio cancelado." };
      }

      const pkg = packages[i]!;
      await prisma.planningProject.update({
        where: { id: project.id },
        data: {
          salicPublishMessage: `Pacote ${i + 1}/${packages.length}: ${pkg.label}`,
        },
      });
      revalidatePlanning(project.id);

      await executeSalicPublishPackage({
        planningProjectId: project.id,
        externalCode: project.externalCode,
        pkg,
      });
    }

    await prisma.planningProject.update({
      where: { id: project.id },
      data: {
        salicPublishStatus: "CONCLUIDO",
        salicPublishMessage:
          packages.length === 1
            ? "1 pacote enviado ao SALIC (NF/RPA + comprovante unificados quando aplicável)."
            : `${packages.length} pacotes enviados ao SALIC (NF/RPA + comprovante unificados quando aplicável).`,
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
    select: { id: true, salicPublishStatus: true, jurisdiction: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!isFederalPlanning(project.jurisdiction)) return federalSalicOnlyError();

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

async function findProofForCommitment(
  commitmentId: string,
  workspaceId: string,
) {
  return prisma.planningDocument.findFirst({
    where: {
      workspaceId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      OR: [
        { commitmentId },
        { allocations: { some: { commitmentId } } },
      ],
    },
    select: {
      id: true,
      salicComprovanteId: true,
      salicPublishMode: true,
      salicRepublishPending: true,
    },
  });
}

/** Envia ao SALIC o PDF (NF + comprovante) de uma reserva específica. */
export async function publishCommitmentToSalic(
  planningProjectId: string,
  commitmentId: string,
  options?: { justificativa?: string },
): Promise<ActionState> {
  await requireUser();
  if (!(await canPublishToSalic())) {
    return { error: "Sem permissão para enviar ao SALIC." };
  }
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true, jurisdiction: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!isFederalPlanning(project.jurisdiction)) return federalSalicOnlyError();

  const commitment = await prisma.rubricCommitment.findFirst({
    where: {
      id: commitmentId,
      planningProjectId,
      workspaceId: entitlements.workspaceId,
      status: "PAID",
    },
    select: { id: true, nfPending: true },
  });
  if (!commitment) {
    return { error: "Reserva paga não encontrada." };
  }
  if (commitment.nfPending) {
    return { error: "Anexe a NF antes de enviar ao SALIC." };
  }

  const proof = await findProofForCommitment(commitmentId, entitlements.workspaceId);
  if (!proof) {
    return { error: "Comprovante de pagamento importado não encontrado para esta reserva." };
  }

  const result = await publishSalicPackages({
    planningProjectId: project.id,
    externalCode: project.externalCode,
    proofIds: [proof.id],
    justificativasByProofId: options?.justificativa
      ? { [proof.id]: options.justificativa }
      : undefined,
  });

  if (result.published === 0) {
    return {
      error: result.errors[0] || "Não foi possível enviar esta reserva ao SALIC.",
    };
  }

  revalidatePlanning(project.id);
  return {
    ok: true,
    message: result.errors.length
      ? `Enviado com avisos: ${result.errors.join(" · ")}`
      : "Comprovante enviado ao SALIC.",
  };
}

/** Envia ao SALIC todos os pacotes prontos do projeto. */
export async function publishAllCommitmentsToSalic(
  planningProjectId: string,
  options?: { justificativasByProofId?: Record<string, string> },
): Promise<ActionState> {
  await requireUser();
  if (!(await canPublishToSalic())) {
    return { error: "Sem permissão para enviar ao SALIC." };
  }
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      documents: { select: { kind: true, status: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { status: true, nfPending: true },
      },
      sheet: { select: { id: true } },
    },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!isFederalPlanning(project.jurisdiction)) return federalSalicOnlyError();

  const readiness = assessSalicPublishReadiness({
    hasSheet: Boolean(project.sheet),
    documents: project.documents,
    commitments: project.commitments,
  });
  if (!readiness.ok) {
    return { error: readiness.reasons[0] || "Projeto ainda não está pronto para envio." };
  }

  const docs = await loadSalicPublishDocs(project.id);
  const packages = buildSalicPublishPackages(docs);
  if (packages.length === 0) {
    return { error: "Nenhum comprovante pronto para envio ao SALIC." };
  }

  const result = await publishSalicPackages({
    planningProjectId: project.id,
    externalCode: project.externalCode,
    justificativasByProofId: options?.justificativasByProofId,
  });

  if (result.published === 0) {
    return { error: result.errors[0] || "Falha ao enviar pacotes ao SALIC." };
  }

  revalidatePlanning(project.id);
  const msg =
    result.errors.length > 0
      ? `${result.published} enviado(s); falhas: ${result.errors.slice(0, 3).join(" · ")}`
      : `${result.published} pacote(s) enviado(s) ao SALIC.`;
  return { ok: true, message: msg };
}

/** Consulta o SALIC e limpa comprovantes removidos manualmente no portal. */
export async function reconcileSalicPublishState(
  planningProjectId: string,
): Promise<
  ActionState & {
    checked?: number;
    cleared?: number;
    salicCount?: number;
    salicItems?: import("@/lib/planning/federal/salic-reconcile").SalicRelacaoPagamento[];
    comprovadoLinesUpdated?: number;
    engagementsLinked?: number;
    auditReport?: import("@/lib/planning/federal/audit-reconcile").AuditPlanningReconcileReport;
  }
> {
  await requireUser();
  if (!(await canPublishToSalic())) {
    return { error: "Sem permissão para verificar envios ao SALIC." };
  }
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    select: { id: true, jurisdiction: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!isFederalPlanning(project.jurisdiction)) return federalSalicOnlyError();

  try {
    const { reconcilePlanningSalicPublishState } = await import(
      "@/lib/planning/federal/salic-reconcile"
    );
    const {
      buildAuditPlanningReconcileReport,
      linkPlanningEngagementsToAuditPayments,
    } = await import("@/lib/planning/federal/audit-reconcile");

    const result = await reconcilePlanningSalicPublishState(project.id);
    const engagementsLinked = await linkPlanningEngagementsToAuditPayments(project.id);
    const auditReport = await buildAuditPlanningReconcileReport(project.id);
    revalidatePlanning(project.id);

    const base = {
      ok: true as const,
      checked: result.checked,
      cleared: result.cleared,
      salicCount: result.salicCount,
      salicItems: result.salicItems,
      comprovadoLinesUpdated: result.comprovadoLinesUpdated,
      engagementsLinked,
      auditReport,
    };

    const notes = [
      result.comprovadoLinesUpdated > 0
        ? `Valores pagos atualizados em ${result.comprovadoLinesUpdated} rubrica(s).`
        : result.comprovadoRubrics > 0
          ? `Valores pagos conferidos em ${result.comprovadoRubrics} rubrica(s).`
          : null,
      engagementsLinked > 0
        ? `${engagementsLinked} contratação(ões) ligada(s) à auditoria.`
        : null,
      auditReport.counts.auditOnly > 0
        ? `${auditReport.counts.auditOnly} só na auditoria.`
        : null,
      auditReport.counts.divergent > 0
        ? `${auditReport.counts.divergent} divergente(s).`
        : null,
    ].filter(Boolean);

    if (result.cleared > 0) {
      return {
        ...base,
        message: `${result.cleared} comprovante(s) não encontrado(s) no SALIC — prontos para reenviar.${notes.length ? ` ${notes.join(" ")}` : ""}`,
      };
    }

    if (result.salicCount === 0 && result.checked === 0 && auditReport.rows.length === 0) {
      return {
        ...base,
        message: "Nenhum comprovante de pagamento encontrado no SALIC para este PRONAC.",
      };
    }

    if (result.checked === 0 && result.salicCount > 0) {
      return {
        ...base,
        message: `${result.salicCount} comprovante(s) no SALIC — nenhuma reserva local vinculada ainda.${notes.length ? ` ${notes.join(" ")}` : ""}`,
      };
    }

    return {
      ...base,
      message: `${result.salicCount} comprovante(s) no SALIC; ${result.checked} conferido(s) localmente.${notes.length ? ` ${notes.join(" ")}` : " Tudo alinhado."}`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Falha ao verificar comprovantes no SALIC.",
    };
  }
}

/** Relatório estático Planejamento × Auditoria (sem abrir o SALIC). */
export async function getAuditPlanningReconcileReport(
  planningProjectId: string,
): Promise<
  ActionState & {
    report?: import("@/lib/planning/federal/audit-reconcile").AuditPlanningReconcileReport;
  }
> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    select: { id: true, jurisdiction: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!isFederalPlanning(project.jurisdiction)) return federalSalicOnlyError();

  const { buildAuditPlanningReconcileReport, linkPlanningEngagementsToAuditPayments } =
    await import("@/lib/planning/federal/audit-reconcile");
  await linkPlanningEngagementsToAuditPayments(project.id);
  const report = await buildAuditPlanningReconcileReport(project.id);
  return { ok: true, report };
}

/** Marca localmente que o comprovante foi removido no portal do SALIC. */
export async function markSalicProofRemovedLocally(
  planningProjectId: string,
  proofId: string,
): Promise<ActionState> {
  await requireUser();
  if (!(await canPublishToSalic())) {
    return { error: "Sem permissão para alterar envios ao SALIC." };
  }
  const { entitlements } = await getWorkspaceContext();

  const proof = await prisma.planningDocument.findFirst({
    where: {
      id: proofId,
      workspaceId: entitlements.workspaceId,
      planningProjectId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      salicComprovanteId: { not: null },
    },
    select: { id: true },
  });
  if (!proof) {
    return { error: "Comprovante enviado ao SALIC não encontrado." };
  }

  const { clearPlanningSalicPublishState } = await import(
    "@/lib/planning/federal/salic-reconcile"
  );
  await clearPlanningSalicPublishState(proofId, entitlements.workspaceId);
  revalidatePlanning(planningProjectId);

  return {
    ok: true,
    message: "Estado local atualizado — a reserva está pronta para reenvio ao SALIC.",
  };
}

/** Importa um Payment da auditoria como reserva paga no planejamento. */
export async function importAuditPaymentToPlanning(
  planningProjectId: string,
  paymentId: string,
): Promise<ActionState> {
  const session = await requireUser();
  if (!(await canPublishToSalic())) {
    return { error: "Sem permissão para importar pagamentos ao planejamento." };
  }
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    select: { id: true, jurisdiction: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!isFederalPlanning(project.jurisdiction)) return federalSalicOnlyError();

  try {
    const { importAuditPaymentAsPaidCommitment } = await import(
      "@/lib/planning/federal/import-audit-payment"
    );
    const result = await importAuditPaymentAsPaidCommitment({
      planningProjectId: project.id,
      paymentId,
      workspaceId: entitlements.workspaceId,
      createdById: session.id,
    });
    revalidatePlanning(project.id);
    return {
      ok: true,
      id: result.commitmentId,
      message: "Pagamento importado como reserva paga no planejamento.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Falha ao importar pagamento.",
    };
  }
}

export async function startReadequacaoFromSalic(
  planningProjectId: string,
): Promise<ActionState> {
  await requireUser();
  if (!(await canReadequacao())) {
    return { error: "Sem permissão para Readequação." };
  }
  const { entitlements } = await getWorkspaceContext();
  await expireOpenReadequacaoDrafts(planningProjectId, entitlements.workspaceId);

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

  let linesFromSalic: Awaited<ReturnType<typeof fetchReadequadaLinesFromSalic>>;
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

  if (linesFromSalic.length === 0) {
    return { error: "Planilha readequada no SALIC está vazia — nada foi importado." };
  }

  const totalSalicApproved =
    Math.round(
      linesFromSalic.reduce((s, l) => s + moneyN(l.approvedAmount), 0) * 100,
    ) / 100;
  if (totalSalicApproved < 0.005) {
    return {
      error:
        "Planilha readequada no SALIC tem R$ 0,00 aprovados. A importação foi cancelada para não apagar a planilha atual.",
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
