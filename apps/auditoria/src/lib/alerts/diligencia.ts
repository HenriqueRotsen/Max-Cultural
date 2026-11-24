import { prisma } from "@/lib/db";
import { isDiligenciaSituacao, normalizeSituacao } from "@/lib/salic/lifecycle";
import { sendAlertEmail } from "@/lib/alerts/email";
import { listAuditoriaUserEmails } from "@/lib/alerts/recipients";

export const DILIGENCIA_ALERT = "DILIGENCIA";
/** Qualquer outra mudança de situação do PRONAC no SALIC. */
export const SITUACAO_ALERT = "SITUACAO";

function auditoriaUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3003").replace(/\/$/, "");
  return `${base}${path}`;
}

export type SituacaoChangeDecision = {
  /** Abrir aviso deste tipo (null = nenhum). */
  alert: typeof DILIGENCIA_ALERT | typeof SITUACAO_ALERT | null;
  /** Saiu de diligência: anotar no aviso de diligência aberto. */
  exitedDiligencia: boolean;
};

/**
 * O que fazer quando a situação do PRONAC chega do SALIC:
 * - situação nova diferente da anterior → aviso (de diligência, se entrou nela);
 * - projeto novo no espelho (sem situação anterior) → só avisa se já chega em diligência;
 * - mesma situação → nada (diligência sem aviso anterior é tratada por quem chama).
 */
export function decideSituacaoChange(
  previous: string | null | undefined,
  next: string | null | undefined,
): SituacaoChangeDecision {
  const prev = normalizeSituacao(previous);
  const cur = normalizeSituacao(next);
  const wasDil = isDiligenciaSituacao(previous);
  const nowDil = isDiligenciaSituacao(next);
  const exitedDiligencia = wasDil && !nowDil;
  if (!cur || prev === cur) return { alert: null, exitedDiligencia: false };
  if (!prev) return { alert: nowDil ? DILIGENCIA_ALERT : null, exitedDiligencia: false };
  return { alert: nowDil && !wasDil ? DILIGENCIA_ALERT : SITUACAO_ALERT, exitedDiligencia };
}

/**
 * Compara a situação anterior e a nova do PRONAC no espelho do SALIC e, se
 * mudou, abre um aviso e avisa (sino + e-mail) quem entra na Auditoria.
 * Entrar em diligência gera o aviso de Diligência; sair dela anota no aviso aberto.
 * Devolve o id do aviso criado, se houver.
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
  const base = { salicAccountId: params.salicAccountId, pronac: params.pronac };
  const decision = decideSituacaoChange(params.previousSituacao, params.nextSituacao);

  if (decision.exitedDiligencia) {
    const open = await prisma.auditAlert.findFirst({
      where: { ...base, type: DILIGENCIA_ALERT, status: { not: "RESOLVIDO" } },
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
  }

  let type = decision.alert;
  // Já em diligência e nunca alertado (ex.: antes desta rotina existir): abre uma vez.
  if (!type && isDiligenciaSituacao(params.nextSituacao)) {
    const any = await prisma.auditAlert.findFirst({ where: { ...base, type: DILIGENCIA_ALERT }, select: { id: true } });
    if (!any) type = DILIGENCIA_ALERT;
  }
  if (!type) return null;

  if (type === DILIGENCIA_ALERT) {
    const open = await prisma.auditAlert.findFirst({
      where: { ...base, type: DILIGENCIA_ALERT, status: { not: "RESOLVIDO" } },
      select: { id: true },
    });
    if (open) return null;
  }

  const label = params.projectName ? `${params.projectName} (PRONAC ${params.pronac})` : `PRONAC ${params.pronac}`;
  const situacao = params.nextSituacao || "diligência";
  const previous = params.previousSituacao?.trim();
  const detail = previous
    ? `${label}: a situação no SALIC mudou de “${previous}” para “${situacao}”.`
    : `${label}: situação no SALIC passou a “${situacao}”.`;
  const alert = await prisma.auditAlert.create({
    data: {
      ...base,
      type,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      title:
        type === DILIGENCIA_ALERT
          ? `Diligência — PRONAC ${params.pronac}`
          : `Mudou de situação — PRONAC ${params.pronac}`,
      detail,
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

/**
 * Sino do MAX Financeiro + e-mail para todo mundo que entra na Auditoria.
 * Só fica de fora quem desligou "Situação no SALIC" nas preferências.
 */
async function notifyAlert(params: {
  workspaceId: string;
  alertId: string;
  pronac: string;
  title: string;
  body: string;
}) {
  const href = auditoriaUrl(`/alertas/${params.alertId}`);
  const [users, settings, hubEmails] = await Promise.all([
    prisma.appUser.findMany({
      where: { workspaceId: params.workspaceId, active: true },
      select: { id: true, email: true, contactEmail: true },
    }),
    prisma.notificationSettings.findMany({ where: { workspaceId: params.workspaceId } }),
    listAuditoriaUserEmails(),
  ]);
  const prefsByUser = new Map(settings.map((s) => [s.userId, s]));
  const meta = { source: "auditoria", alertId: params.alertId, pronac: params.pronac };
  const userByEmail = new Map(users.map((u) => [u.email.trim().toLowerCase(), u]));
  // Sem leitura do hub: cai para os usuários do workspace.
  const audience = hubEmails ?? users.map((u) => u.email.trim().toLowerCase());

  const bell = (userId: string | null) =>
    prisma.appNotification.create({
      data: {
        workspaceId: params.workspaceId,
        userId,
        type: "SALIC_DILIGENCIA",
        title: params.title,
        body: params.body,
        href,
        meta,
      },
    });

  if (audience.length === 0) {
    await bell(null);
    return;
  }

  const sent = new Set<string>();
  for (const email of audience) {
    const user = userByEmail.get(email);
    if (user && prefsByUser.get(user.id)?.salicDiligencia === false) continue;
    if (user) await bell(user.id);
    const to = (user?.contactEmail || email).trim();
    if (!to || sent.has(to.toLowerCase())) continue;
    sent.add(to.toLowerCase());
    await sendAlertEmail({ to, title: params.title, body: params.body, href });
  }
}
