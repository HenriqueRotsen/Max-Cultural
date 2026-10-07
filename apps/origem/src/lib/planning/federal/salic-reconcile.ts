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

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

async function writeComprovadoByPlanilha(
  planningProjectId: string,
  byPlanilha: Map<string, number>,
  opts?: { clearMissing?: boolean },
): Promise<{ updated: number; rubrics: number; matchedLines: number }> {
  const sheet = await prisma.projectBudgetSheet.findUnique({
    where: { planningProjectId },
    include: {
      lines: {
        select: { id: true, planilhaAprovacaoId: true, salicComprovado: true },
      },
    },
  });
  if (!sheet) return { updated: 0, rubrics: 0, matchedLines: 0 };

  const clearMissing = opts?.clearMissing !== false;
  let updated = 0;
  let matchedLines = 0;

  for (const line of sheet.lines) {
    const planilhaId = line.planilhaAprovacaoId?.trim();
    const total =
      planilhaId && byPlanilha.has(planilhaId)
        ? roundMoney(byPlanilha.get(planilhaId)!)
        : null;
    if (total != null) matchedLines += 1;

    if (total == null && !clearMissing) continue;

    const current =
      line.salicComprovado != null ? Number(line.salicComprovado) : null;
    const next = total;
    if (
      (current == null && next == null) ||
      (current != null && next != null && Math.abs(current - next) < 0.01)
    ) {
      continue;
    }

    await prisma.projectBudgetLine.update({
      where: { id: line.id },
      data: { salicComprovado: next },
    });
    updated += 1;
  }

  return { updated, rubrics: byPlanilha.size, matchedLines };
}

/** Soma comprovantes do SALIC por rubrica e grava em ProjectBudgetLine.salicComprovado. */
export async function syncSalicComprovadoFromRelacaoPagamentos(
  planningProjectId: string,
  items: SalicRelacaoPagamento[],
): Promise<{ updated: number; rubrics: number }> {
  const byPlanilha = new Map<string, number>();
  for (const item of items) {
    if (!item.planilhaAprovacaoId || !(item.amount > 0)) continue;
    const key = String(item.planilhaAprovacaoId).trim();
    byPlanilha.set(key, (byPlanilha.get(key) ?? 0) + item.amount);
  }
  if (byPlanilha.size === 0) return { updated: 0, rubrics: 0 };

  const result = await writeComprovadoByPlanilha(planningProjectId, byPlanilha, {
    clearMissing: false,
  });
  return { updated: result.updated, rubrics: result.rubrics };
}

function normItem(name: string | null | undefined) {
  return String(name || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recalcula salicComprovado a partir dos Payment já syncados da auditoria.
 * 1) casa por id_planilha_aprovacao;
 * 2) pagamentos órfãos (ID de planilha antiga) caem no item homônimo,
 *    rateados pelo homologado quando há várias linhas com o mesmo nome.
 * Zera linhas sem match — evita soma inflada de planilha antiga.
 */
export async function syncSalicComprovadoFromLocalPayments(
  planningProjectId: string,
): Promise<{
  updated: number;
  rubrics: number;
  matchedLines: number;
  paymentCount: number;
  paymentTotal: number;
  orphanPayments: number;
}> {
  const planning = await prisma.planningProject.findUnique({
    where: { id: planningProjectId },
    select: {
      projectId: true,
      sheet: {
        include: {
          lines: {
            select: {
              id: true,
              planilhaAprovacaoId: true,
              itemName: true,
              homologatedAmount: true,
              salicComprovado: true,
            },
          },
        },
      },
    },
  });
  if (!planning?.projectId || !planning.sheet) {
    return {
      updated: 0,
      rubrics: 0,
      matchedLines: 0,
      paymentCount: 0,
      paymentTotal: 0,
      orphanPayments: 0,
    };
  }

  const lines = planning.sheet.lines;
  const lineIds = new Set(
    lines
      .map((l) => l.planilhaAprovacaoId?.trim())
      .filter((id): id is string => Boolean(id)),
  );

  const payments = await prisma.payment.findMany({
    where: { projectId: planning.projectId },
    select: { planilhaAprovacaoId: true, amount: true, itemName: true },
  });

  const byPlanilha = new Map<string, number>();
  const orphanByItem = new Map<string, number>();
  let paymentTotal = 0;
  let orphanPayments = 0;

  for (const p of payments) {
    const amount = Number(p.amount) || 0;
    paymentTotal += amount;
    if (!(amount > 0)) continue;
    const key = p.planilhaAprovacaoId?.trim();
    if (key && lineIds.has(key)) {
      byPlanilha.set(key, (byPlanilha.get(key) ?? 0) + amount);
      continue;
    }
    orphanPayments += 1;
    const item = normItem(p.itemName);
    if (!item) continue;
    orphanByItem.set(item, (orphanByItem.get(item) ?? 0) + amount);
  }

  // Rateia órfãos entre linhas com o mesmo item (peso = homologado).
  const linesByItem = new Map<string, typeof lines>();
  for (const line of lines) {
    const item = normItem(line.itemName);
    if (!item) continue;
    const list = linesByItem.get(item) || [];
    list.push(line);
    linesByItem.set(item, list);
  }

  for (const [item, orphanTotal] of orphanByItem) {
    const group = linesByItem.get(item);
    if (!group?.length) continue;
    const weights = group.map((l) => Math.max(0, Number(l.homologatedAmount) || 0));
    const weightSum = weights.reduce((s, w) => s + w, 0);
    if (weightSum <= 0) {
      const targetId = group[0]!.planilhaAprovacaoId?.trim();
      if (targetId) {
        byPlanilha.set(targetId, (byPlanilha.get(targetId) ?? 0) + orphanTotal);
      }
      continue;
    }
    let allocated = 0;
    group.forEach((line, idx) => {
      const id = line.planilhaAprovacaoId?.trim();
      if (!id) return;
      const share =
        idx === group.length - 1
          ? roundMoney(orphanTotal - allocated)
          : roundMoney((orphanTotal * weights[idx]!) / weightSum);
      allocated = roundMoney(allocated + share);
      byPlanilha.set(id, (byPlanilha.get(id) ?? 0) + share);
    });
  }

  const result = await writeComprovadoByPlanilha(planningProjectId, byPlanilha, {
    clearMissing: true,
  });

  return {
    updated: result.updated,
    rubrics: result.rubrics,
    matchedLines: result.matchedLines,
    paymentCount: payments.length,
    paymentTotal: roundMoney(paymentTotal),
    orphanPayments,
  };
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
