"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { logPlanningAction } from "@/lib/activity-audit";
import { canCloseProject } from "@/lib/planning/acl";
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
 * Encerrado, o projeto some do Origem e a busca no SALIC para.
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
