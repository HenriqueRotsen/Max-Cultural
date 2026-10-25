import { prisma } from "@/lib/db";
import { classifyLifecycleFromSituacao } from "@/lib/planning/lifecycle";

/**
 * Grava a situação do PRONAC no SALIC (ex.: "E37 - Diligência"), lida pela sessão
 * do próprio Planejamento, e avisa quando o projeto entra em diligência.
 */
export async function applySalicSituacaoToPlanningProject(params: {
  planningProjectId: string;
  situacao: string | null | undefined;
}): Promise<void> {
  const situacao = (params.situacao || "").trim() || null;
  if (!situacao) return;

  const project = await prisma.planningProject.findUnique({
    where: { id: params.planningProjectId },
    select: { id: true, workspaceId: true, externalCode: true, name: true, situacao: true },
  });
  if (!project) return;

  await prisma.planningProject.update({
    where: { id: project.id },
    data: {
      situacao,
      situacaoAt: new Date(),
      lifecycleStatus: classifyLifecycleFromSituacao(situacao),
    },
  });

  if (project.situacao === situacao) return;
  try {
    const { notifyDiligenciaIfEntered } = await import("@/lib/planning/diligencia-notify");
    await notifyDiligenciaIfEntered({
      workspaceId: project.workspaceId,
      projectId: project.id,
      pronac: project.externalCode,
      projectName: project.name,
      previousSituacao: project.situacao,
      nextSituacao: situacao,
      planningProjectId: project.id,
    });
  } catch (error) {
    console.error(`Aviso de diligência falhou (PRONAC ${project.externalCode}):`, error);
  }
}
