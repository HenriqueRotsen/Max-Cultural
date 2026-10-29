"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { logPlanningAction } from "@/lib/activity-audit";
import { canCloseProject, canEditRubricas } from "@/lib/planning/acl";
import { parseProjectCaps } from "@/lib/planning/project-caps";
import type { ActionState } from "@/lib/planning/action-state";
import { revalidatePlanning } from "@/lib/planning/server-utils";

/** "Entendi" no aviso de troca para a planilha readequada. */
export async function dismissReadequadaNotice(planningProjectId: string) {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  await prisma.planningProject.updateMany({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    data: { readequadaNoticeSeenAt: new Date() },
  });
  revalidatePlanning(planningProjectId);
}

/**
 * Encerra o projeto. Confirmação dupla: o diálogo mostra o resumo e exige a espera
 * de 10 s; aqui a pessoa precisa ter digitado o código do projeto (PRONAC/código).
 * Encerrado, o projeto some do Financeiro e a busca no SALIC para.
 */
export async function closePlanningProject(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  if (!(await canCloseProject())) {
    return { error: "Sem permissão para encerrar projetos." };
  }
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId, closedAt: null },
    select: { id: true, externalCode: true, name: true },
  });
  if (!project) return { error: "Projeto não encontrado ou já encerrado." };

  const typed = String(formData.get("confirmCode") || "").trim();
  if (typed !== project.externalCode) {
    return { error: `Digite exatamente o código do projeto (${project.externalCode}) para confirmar.` };
  }
  const reason = String(formData.get("reason") || "").trim().slice(0, 1000);

  await prisma.planningProject.update({
    where: { id: project.id },
    data: {
      lifecycleStatus: "ENCERRADO",
      closedAt: new Date(),
      closedById: session.id,
      closeReason: reason || null,
      sheetSearchActive: false,
    },
  });
  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.project_closed",
    entityType: "PlanningProject",
    entityId: project.id,
    meta: { externalCode: project.externalCode, reason: reason || null },
  });

  revalidatePlanning(project.id);
  redirect("/planejamento?encerrado=1");
}

/** Ajusta os limites do projeto (fornecedor, vínculo, excesso na rubrica). */
export async function updateProjectCaps(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  if (!(await canEditRubricas())) {
    return { error: "Sem permissão para alterar os limites do projeto." };
  }
  const caps = parseProjectCaps(formData);
  if ("error" in caps) return { error: caps.error };
  const { entitlements } = await getWorkspaceContext();
  const updated = await prisma.planningProject.updateMany({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId, closedAt: null },
    data: caps,
  });
  if (updated.count === 0) return { error: "Projeto não encontrado." };
  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.project_caps_updated",
    entityType: "PlanningProject",
    entityId: planningProjectId,
    meta: caps,
  });
  revalidatePlanning(planningProjectId);
  return { ok: true, message: "Limites atualizados." };
}
