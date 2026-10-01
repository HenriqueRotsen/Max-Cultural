import { prisma } from "@/lib/db";
import { isDiligenciaSituacao } from "@/lib/planning/lifecycle";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { sendNotificationEmail } from "@/lib/planning/notify-email";

/**
 * Se a situação entrou em diligência, notifica usuários ativos do workspace.
 * Deduplica notificação não lida recente do mesmo PRONAC.
 */
export async function notifyDiligenciaIfEntered(params: {
  workspaceId: string;
  projectId: string;
  pronac: string;
  projectName?: string | null;
  previousSituacao: string | null | undefined;
  nextSituacao: string | null | undefined;
  planningProjectId?: string | null;
}): Promise<number> {
  const was = isDiligenciaSituacao(params.previousSituacao);
  const now = isDiligenciaSituacao(params.nextSituacao);
  if (!now || was) return 0;

  const href = params.planningProjectId
    ? `/planejamento/${params.planningProjectId}`
    : `/panorama/pronac?q=${encodeURIComponent(params.pronac)}`;
  const title = `Diligência — PRONAC ${params.pronac}`;
  const body = params.projectName
    ? `${params.projectName}: situação no SALIC passou a diligência (${params.nextSituacao || "diligenciado"}).`
    : `PRONAC ${params.pronac}: situação no SALIC passou a diligência (${params.nextSituacao || "diligenciado"}).`;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const existing = await prisma.appNotification.findFirst({
    where: {
      workspaceId: params.workspaceId,
      type: "SALIC_DILIGENCIA",
      href,
      readAt: null,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (existing) return 0;

  const users = await prisma.appUser.findMany({
    where: {
      workspaceId: params.workspaceId,
      active: true,
    },
    select: { id: true, email: true, contactEmail: true },
  });

  let created = 0;
  for (const user of users) {
    const prefs = await getNotificationPrefs(params.workspaceId, user.id);
    if (!prefs.salicDiligencia) continue;

    await prisma.appNotification.create({
      data: {
        workspaceId: params.workspaceId,
        userId: user.id,
        type: "SALIC_DILIGENCIA",
        title,
        body,
        href,
      },
    });
    created += 1;

    if (prefs.emailEnabled) {
      const to = (user.contactEmail || user.email || "").trim();
      if (to) {
        await sendNotificationEmail({ to, title, body, href }).catch(() => false);
      }
    }
  }

  // Também cria um aviso de workspace (sem userId) para o sino genérico
  if (created === 0 && users.length === 0) {
    await prisma.appNotification.create({
      data: {
        workspaceId: params.workspaceId,
        userId: null,
        type: "SALIC_DILIGENCIA",
        title,
        body,
        href,
      },
    });
    created = 1;
  }

  return created;
}
