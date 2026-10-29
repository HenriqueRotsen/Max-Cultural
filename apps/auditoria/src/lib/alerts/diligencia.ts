import { prisma } from "@/lib/db";
import { isDiligenciaSituacao } from "@/lib/salic/lifecycle";
import { sendAlertEmail } from "@/lib/alerts/email";

export const DILIGENCIA_ALERT = "DILIGENCIA";

function auditoriaUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3003").replace(/\/$/, "");
  return `${base}${path}`;
}

/**
 * Compara a situação anterior e a nova do PRONAC no espelho do SALIC.
 * - Entrou em diligência (ou já estava e nunca houve alerta): abre alerta e avisa.
 * - Saiu de diligência: anota no alerta aberto (resolver continua manual).
 * Devolve o id do alerta criado, se houver.
 */
export async function recordSituacaoChange(params: {
  workspaceId: string;
  salicAccountId: string;
  projectId: string;
  pronac: string;
  projectName?: string | null;
  previousSituacao: string | null | undefined;
  nextSituacao: string | null | undefined;
}): Promise<string | null> {
  const was = isDiligenciaSituacao(params.previousSituacao);
  const now = isDiligenciaSituacao(params.nextSituacao);
  const where = {
    salicAccountId: params.salicAccountId,
    pronac: params.pronac,
    type: DILIGENCIA_ALERT,
  };

  if (was && !now) {
    const open = await prisma.auditAlert.findFirst({
      where: { ...where, status: { not: "RESOLVIDO" } },
      orderBy: { detectedAt: "desc" },
    });
    if (open) {
      const meta = (open.meta as Record<string, unknown> | null) || {};
      await prisma.auditAlert.update({
        where: { id: open.id },
        data: {
          meta: { ...meta, exitedAt: new Date().toISOString(), exitedTo: params.nextSituacao || null },
        },
      });
    }
    return null;
  }

  if (!now) return null;
  // Já em diligência e já alertado (aberto ou resolvido) nesta passagem: nada a fazer.
  if (was) {
    const any = await prisma.auditAlert.findFirst({ where, select: { id: true } });
    if (any) return null;
  }
  const open = await prisma.auditAlert.findFirst({
    where: { ...where, status: { not: "RESOLVIDO" } },
    select: { id: true },
  });
  if (open) return null;

  const label = params.projectName ? `${params.projectName} (PRONAC ${params.pronac})` : `PRONAC ${params.pronac}`;
  const situacao = params.nextSituacao || "diligência";
  const alert = await prisma.auditAlert.create({
    data: {
      ...where,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      title: `Diligência — PRONAC ${params.pronac}`,
      detail: `${label}: situação no SALIC passou a “${situacao}”.`,
      meta: { previousSituacao: params.previousSituacao || null, situacao },
    },
  });

  await notifyAlert({
    workspaceId: params.workspaceId,
    alertId: alert.id,
    pronac: params.pronac,
    title: alert.title,
    body: alert.detail,
  });
  return alert.id;
}

/** Sino do MAX Financeiro + e-mail, respeitando as preferências de cada usuário. */
async function notifyAlert(params: {
  workspaceId: string;
  alertId: string;
  pronac: string;
  title: string;
  body: string;
}) {
  const href = auditoriaUrl(`/alertas/${params.alertId}`);
  const [users, settings] = await Promise.all([
    prisma.appUser.findMany({
      where: { workspaceId: params.workspaceId, active: true },
      select: { id: true, email: true, contactEmail: true },
    }),
    prisma.notificationSettings.findMany({ where: { workspaceId: params.workspaceId } }),
  ]);
  const prefsByUser = new Map(settings.map((s) => [s.userId, s]));
  const meta = { source: "auditoria", alertId: params.alertId, pronac: params.pronac };

  if (users.length === 0) {
    await prisma.appNotification.create({
      data: {
        workspaceId: params.workspaceId,
        userId: null,
        type: "SALIC_DILIGENCIA",
        title: params.title,
        body: params.body,
        href,
        meta,
      },
    });
    return;
  }

  for (const user of users) {
    const prefs = prefsByUser.get(user.id);
    if (prefs && !prefs.salicDiligencia) continue;
    await prisma.appNotification.create({
      data: {
        workspaceId: params.workspaceId,
        userId: user.id,
        type: "SALIC_DILIGENCIA",
        title: params.title,
        body: params.body,
        href,
        meta,
      },
    });
    if (prefs?.emailEnabled) {
      await sendAlertEmail({
        to: user.contactEmail || user.email,
        title: params.title,
        body: params.body,
        href,
      });
    }
  }
}
