"use server";

import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { logPlanningAction } from "@/lib/activity-audit";
import { canEditRubricas } from "@/lib/planning/acl";
import type { ActionState } from "@/lib/planning/action-state";
import { isFederalPlanning } from "@/lib/planning/lifecycle";
import { revalidatePlanning } from "@/lib/planning/server-utils";

/** Número digitado em pt-BR ("1.234,56") ou com ponto ("1234.56"). */
function num(raw: FormDataEntryValue | null): number {
  const s = String(raw ?? "").trim();
  if (!s) return NaN;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type LineInput = {
  fonteRecurso: string;
  productName: string;
  stageName: string;
  state: string;
  city: string;
  itemName: string;
  unit: string;
  quantity: number;
  occurrences: number;
  unitPrice: number;
  amount: number;
};

function parseLine(formData: FormData, defaultUf: string): LineInput | { error: string } {
  const text = (k: string, max = 300) => String(formData.get(k) || "").trim().slice(0, max);
  const itemName = text("itemName");
  const productName = text("productName");
  if (!itemName || !productName) return { error: "Informe o produto e o item da rubrica." };
  const quantity = num(formData.get("quantity"));
  const occurrences = num(formData.get("occurrences"));
  const unitPrice = num(formData.get("unitPrice"));
  if (!(quantity > 0) || !(occurrences > 0) || !(unitPrice >= 0)) {
    return { error: "Quantidade e ocorrência precisam ser maiores que zero; valor unitário não pode ser negativo." };
  }
  return {
    fonteRecurso: text("fonteRecurso") || "Incentivo estadual",
    productName,
    stageName: text("stageName") || "Execução",
    state: (text("state", 2) || defaultUf).toUpperCase(),
    city: text("city"),
    itemName,
    unit: text("unit", 60) || "Unidade",
    quantity,
    occurrences,
    unitPrice,
    amount: round2(quantity * occurrences * unitPrice),
  };
}

/** Só projeto estadual ativo, com permissão de editar rubricas. */
async function loadStateProject(planningProjectId: string) {
  await requireUser();
  if (!(await canEditRubricas())) return { error: "Sem permissão para editar rubricas." } as const;
  const { entitlements, session } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId, closedAt: null },
    include: { sheet: { select: { id: true } } },
  });
  if (!project) return { error: "Projeto não encontrado." } as const;
  if (isFederalPlanning(project.jurisdiction)) {
    return { error: "No projeto federal as rubricas vêm da planilha do SALIC." } as const;
  }
  return { project, userId: session?.id ?? null } as const;
}

async function ensureSheet(planningProjectId: string, sheetId: string | undefined) {
  if (sheetId) return sheetId;
  const sheet = await prisma.projectBudgetSheet.create({
    data: { planningProjectId, totalApproved: 0, importedAt: new Date(), available: true },
  });
  await prisma.planningProject.update({
    where: { id: planningProjectId },
    data: { importedAt: new Date(), importSource: "STATE_MANUAL" },
  });
  return sheet.id;
}

async function recomputeSheetTotal(sheetId: string) {
  const agg = await prisma.projectBudgetLine.aggregate({
    where: { sheetId },
    _sum: { approvedAmount: true },
  });
  await prisma.projectBudgetSheet.update({
    where: { id: sheetId },
    data: { totalApproved: round2(Number(agg._sum.approvedAmount ?? 0)) },
  });
}

async function reservedOnLine(budgetLineId: string) {
  const agg = await prisma.rubricCommitment.aggregate({
    where: { budgetLineId, status: { in: ["RESERVED", "PAID"] } },
    _sum: { amount: true },
  });
  return round2(Number(agg._sum.amount ?? 0));
}

export async function addStateBudgetLine(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await loadStateProject(planningProjectId);
  if ("error" in ctx) return { error: ctx.error };
  const parsed = parseLine(formData, ctx.project.jurisdiction);
  if ("error" in parsed) return { error: parsed.error };

  const sheetId = await ensureSheet(ctx.project.id, ctx.project.sheet?.id);
  const last = await prisma.projectBudgetLine.aggregate({ where: { sheetId }, _max: { sortOrder: true } });
  const { amount, ...fields } = parsed;
  const line = await prisma.projectBudgetLine.create({
    data: {
      sheetId,
      ...fields,
      homologatedAmount: amount,
      approvedAmount: amount,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
  });
  await recomputeSheetTotal(sheetId);
  await logPlanningAction({
    actorUserId: ctx.userId,
    action: "planning.state_line_added",
    entityType: "ProjectBudgetLine",
    entityId: line.id,
    meta: { planningProjectId: ctx.project.id, itemName: line.itemName, amount },
  });
  revalidatePlanning(ctx.project.id);
  return { ok: true, message: "Rubrica adicionada." };
}

export async function updateStateBudgetLine(
  budgetLineId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const line = await prisma.projectBudgetLine.findUnique({
    where: { id: budgetLineId },
    select: { id: true, sheetId: true, sheet: { select: { planningProjectId: true } } },
  });
  if (!line) return { error: "Rubrica não encontrada." };
  const ctx = await loadStateProject(line.sheet.planningProjectId);
  if ("error" in ctx) return { error: ctx.error };
  const parsed = parseLine(formData, ctx.project.jurisdiction);
  if ("error" in parsed) return { error: parsed.error };

  const reserved = await reservedOnLine(line.id);
  if (parsed.amount + 0.005 < reserved) {
    return {
      error: `O valor não pode ficar abaixo do que já está reservado/pago nesta rubrica (R$ ${reserved.toFixed(2)}).`,
    };
  }
  const { amount, ...fields } = parsed;
  await prisma.projectBudgetLine.update({
    where: { id: line.id },
    data: { ...fields, homologatedAmount: amount, approvedAmount: amount },
  });
  await recomputeSheetTotal(line.sheetId);
  await logPlanningAction({
    actorUserId: ctx.userId,
    action: "planning.state_line_updated",
    entityType: "ProjectBudgetLine",
    entityId: line.id,
    meta: { planningProjectId: ctx.project.id, amount },
  });
  revalidatePlanning(ctx.project.id);
  return { ok: true, message: "Rubrica atualizada." };
}

export async function removeStateBudgetLine(budgetLineId: string): Promise<ActionState> {
  const line = await prisma.projectBudgetLine.findUnique({
    where: { id: budgetLineId },
    select: {
      id: true,
      sheetId: true,
      itemName: true,
      sheet: { select: { planningProjectId: true } },
      _count: { select: { commitments: true, allocations: true, engagements: true } },
    },
  });
  if (!line) return { error: "Rubrica não encontrada." };
  const ctx = await loadStateProject(line.sheet.planningProjectId);
  if ("error" in ctx) return { error: ctx.error };
  if (line._count.commitments || line._count.allocations || line._count.engagements) {
    return { error: "Esta rubrica já tem reserva ou pagamento; ajuste o valor em vez de remover." };
  }
  await prisma.projectBudgetLine.delete({ where: { id: line.id } });
  await recomputeSheetTotal(line.sheetId);
  await logPlanningAction({
    actorUserId: ctx.userId,
    action: "planning.state_line_removed",
    entityType: "ProjectBudgetLine",
    entityId: line.id,
    meta: { planningProjectId: ctx.project.id, itemName: line.itemName },
  });
  revalidatePlanning(ctx.project.id);
  return { ok: true, message: "Rubrica removida." };
}
