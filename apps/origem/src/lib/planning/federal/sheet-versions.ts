import { prisma } from "@/lib/db";
import type { HomologatedLine } from "@/lib/planning/homologada";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { sendNotificationEmail } from "@/lib/planning/notify-email";

export type SheetVersionKind = "HOMOLOGADA" | "READEQUADA";

/** Guarda a cópia fixa da planilha do SALIC (permite ver a "anterior" depois da troca). */
export async function saveSheetVersion(params: {
  planningProjectId: string;
  kind: SheetVersionKind;
  lines: HomologatedLine[];
  totalApproved: number;
}) {
  return prisma.projectBudgetSheetVersion.create({
    data: {
      planningProjectId: params.planningProjectId,
      kind: params.kind,
      totalApproved: params.totalApproved,
      linesJson: params.lines as unknown as object,
    },
  });
}

export async function hasSheetVersion(planningProjectId: string, kind: SheetVersionKind) {
  return (
    (await prisma.projectBudgetSheetVersion.count({ where: { planningProjectId, kind } })) > 0
  );
}

export async function latestSheetVersion(planningProjectId: string, kind: SheetVersionKind) {
  const row = await prisma.projectBudgetSheetVersion.findFirst({
    where: { planningProjectId, kind },
    orderBy: { fetchedAt: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    fetchedAt: row.fetchedAt,
    totalApproved: Number(row.totalApproved),
    lines: (Array.isArray(row.linesJson) ? row.linesJson : []) as unknown as HomologatedLine[],
  };
}

/** Avisa no sino (e por e-mail, se ligado) que o projeto passou a usar a readequada. */
export async function notifyReadequadaApplied(planningProjectId: string) {
  const project = await prisma.planningProject.findUnique({
    where: { id: planningProjectId },
    select: { id: true, workspaceId: true, externalCode: true, name: true },
  });
  if (!project) return;
  const title = `Planilha readequada aplicada — PRONAC ${project.externalCode}`;
  const body = `${project.name || `PRONAC ${project.externalCode}`}: o SALIC publicou a planilha readequada e ela passou a ser a planilha do projeto. A homologada anterior continua disponível para consulta.`;
  const href = `/planejamento/${project.id}/planilhas`;

  const users = await prisma.appUser.findMany({
    where: { workspaceId: project.workspaceId, active: true },
    select: { id: true, email: true, contactEmail: true },
  });
  for (const user of users) {
    const prefs = await getNotificationPrefs(project.workspaceId, user.id);
    if (!prefs.readequadaApplied) continue;
    await prisma.appNotification.create({
      data: {
        workspaceId: project.workspaceId,
        userId: user.id,
        type: "READEQUADA_APPLIED",
        title,
        body,
        href,
        meta: { planningProjectId: project.id },
      },
    });
    if (prefs.emailEnabled) {
      await sendNotificationEmail({ to: user.contactEmail || user.email, title, body, href });
    }
  }
}
