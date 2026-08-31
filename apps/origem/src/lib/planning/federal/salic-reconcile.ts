import { prisma } from "@/lib/db";
import { isFederalPlanning } from "@/lib/planning/lifecycle";
import {
  fetchSalicRelacaoPagamentos,
  type SalicRelacaoPagamento,
} from "@/lib/salic/publish-robot";

export type { SalicRelacaoPagamento };

export const CLEAR_SALIC_PUBLISH_FIELDS = {
  salicComprovanteId: null,
  salicPublishMode: null,
  salicPublishedAt: null,
  salicRepublishPending: false,
} as const;

export type SalicReconcileSummary = {
  checked: number;
  cleared: number;
  clearedProofIds: string[];
  salicCount: number;
  salicItems: SalicRelacaoPagamento[];
  comprovadoLinesUpdated: number;
  comprovadoRubrics: number;
};

/** Limpa vínculos locais cujo id_comprovante_pagamento não consta mais no SALIC. */
export async function reconcilePlanningSalicFromExternalIds(
  planningProjectId: string,
  seenExternalIds: Set<string>,
): Promise<number> {
  const docs = await prisma.planningDocument.findMany({
    where: {
      planningProjectId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      salicComprovanteId: { not: null },
    },
    select: { id: true, salicComprovanteId: true },
  });

  const orphanIds = docs
    .filter((doc) => doc.salicComprovanteId && !seenExternalIds.has(doc.salicComprovanteId))
    .map((doc) => doc.id);

  if (orphanIds.length === 0) return 0;

  await prisma.planningDocument.updateMany({
    where: { id: { in: orphanIds } },
    data: CLEAR_SALIC_PUBLISH_FIELDS,
  });

  return orphanIds.length;
}

/** Soma comprovantes do SALIC por rubrica e grava em ProjectBudgetLine.salicComprovado. */
export async function syncSalicComprovadoFromRelacaoPagamentos(
  planningProjectId: string,
  items: SalicRelacaoPagamento[],
): Promise<{ updated: number; rubrics: number }> {
  const sheet = await prisma.projectBudgetSheet.findUnique({
    where: { planningProjectId },
    include: {
      lines: {
        select: { id: true, planilhaAprovacaoId: true, salicComprovado: true },
      },
    },
  });
  if (!sheet) return { updated: 0, rubrics: 0 };

  const byPlanilha = new Map<string, number>();
  for (const item of items) {
    if (!item.planilhaAprovacaoId || !(item.amount > 0)) continue;
    const key = item.planilhaAprovacaoId;
    byPlanilha.set(key, (byPlanilha.get(key) ?? 0) + item.amount);
  }
  if (byPlanilha.size === 0) return { updated: 0, rubrics: 0 };

  let updated = 0;
  for (const line of sheet.lines) {
    const planilhaId = line.planilhaAprovacaoId?.trim();
    if (!planilhaId) continue;
    const total = byPlanilha.get(planilhaId);
    if (total == null) continue;

    const current =
      line.salicComprovado != null ? Number(line.salicComprovado) : null;
    if (current != null && Math.abs(current - total) < 0.01) continue;

    await prisma.projectBudgetLine.update({
      where: { id: line.id },
      data: { salicComprovado: total },
    });
    updated += 1;
  }

  return { updated, rubrics: byPlanilha.size };
}

/** Consulta o SALIC ao vivo e alinha o estado local dos comprovantes enviados. */
export async function reconcilePlanningSalicPublishState(
  planningProjectId: string,
): Promise<SalicReconcileSummary> {
  const project = await prisma.planningProject.findUniqueOrThrow({
    where: { id: planningProjectId },
    select: { externalCode: true, jurisdiction: true },
  });

  if (!isFederalPlanning(project.jurisdiction)) {
    return {
      checked: 0,
      cleared: 0,
      clearedProofIds: [],
      salicCount: 0,
      salicItems: [],
      comprovadoLinesUpdated: 0,
      comprovadoRubrics: 0,
    };
  }

  const salicItems = await fetchSalicRelacaoPagamentos({
    planningProjectId,
    externalCode: project.externalCode,
  });
  const salicIds = new Set(salicItems.map((item) => item.id));

  const comprovadoSync = await syncSalicComprovadoFromRelacaoPagamentos(
    planningProjectId,
    salicItems,
  );

  const docs = await prisma.planningDocument.findMany({
    where: {
      planningProjectId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      salicComprovanteId: { not: null },
    },
    select: { id: true, salicComprovanteId: true },
  });

  const orphanIds = docs
    .filter((doc) => doc.salicComprovanteId && !salicIds.has(doc.salicComprovanteId))
    .map((doc) => doc.id);

  if (orphanIds.length > 0) {
    await prisma.planningDocument.updateMany({
      where: { id: { in: orphanIds } },
      data: CLEAR_SALIC_PUBLISH_FIELDS,
    });
  }

  return {
    checked: docs.length,
    cleared: orphanIds.length,
    clearedProofIds: orphanIds,
    salicCount: salicItems.length,
    salicItems,
    comprovadoLinesUpdated: comprovadoSync.updated,
    comprovadoRubrics: comprovadoSync.rubrics,
  };
}

/** Marca manualmente que o comprovante foi removido no portal do SALIC. */
export async function clearPlanningSalicPublishState(
  proofId: string,
  workspaceId: string,
): Promise<void> {
  const proof = await prisma.planningDocument.findFirst({
    where: {
      id: proofId,
      workspaceId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      salicComprovanteId: { not: null },
    },
    select: { id: true },
  });
  if (!proof) {
    throw new Error("Comprovante enviado ao SALIC não encontrado.");
  }

  await prisma.planningDocument.update({
    where: { id: proofId },
    data: CLEAR_SALIC_PUBLISH_FIELDS,
  });
}

/** Durante sync da auditoria: alinha planejamento vinculado ao projeto SALIC. */
export async function reconcileLinkedPlanningSalicFromExternalIds(
  salicProjectId: string,
  seenExternalIds: Set<string>,
): Promise<number> {
  const planning = await prisma.planningProject.findFirst({
    where: { projectId: salicProjectId },
    select: { id: true },
  });
  if (!planning) return 0;
  return reconcilePlanningSalicFromExternalIds(planning.id, seenExternalIds);
}
