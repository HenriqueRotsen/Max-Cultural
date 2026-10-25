import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { markAlertSeen, reopenAlert, resolveAlert } from "@/lib/alerts/actions";
import {
  ALERT_STATUS_BADGE,
  ALERT_STATUS_LABEL,
  ALERT_TYPE_LABEL,
  formatDateTime,
} from "@/lib/alerts/labels";

export const dynamic = "force-dynamic";

export default async function AlertaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const alert = await prisma.auditAlert.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      salicAccount: { select: { name: true } },
      project: { select: { name: true, situacao: true } },
    },
  });
  if (!alert) notFound();

  const userIds = [alert.seenById, alert.resolvedById].filter(Boolean) as string[];
  const users = userIds.length
    ? await prisma.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const who = (uid: string | null) => {
    const u = users.find((x) => x.id === uid);
    return u ? u.name || u.email : "—";
  };
  const meta = (alert.meta as { exitedAt?: string; exitedTo?: string | null } | null) || {};

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/alertas"
        backLabel="Voltar aos alertas"
        breadcrumb={`Auditoria › Alertas › ${ALERT_TYPE_LABEL[alert.type] || alert.type}`}
        title={alert.title}
        description={alert.detail}
        actions={
          <span className={`badge ${ALERT_STATUS_BADGE[alert.status]}`}>{ALERT_STATUS_LABEL[alert.status]}</span>
        }
      />

      <section className="card grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">Proponente</p>
          <p className="mt-1 text-[var(--navy)]">{alert.salicAccount.name}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">Projeto</p>
          <p className="mt-1">
            <Link href={`/panorama/pronac/${alert.pronac}`} className="font-semibold text-[var(--navy)] underline">
              {alert.project?.name || `PRONAC ${alert.pronac}`}
            </Link>
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">Detectado em</p>
          <p className="mt-1">{formatDateTime(alert.detectedAt)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">Situação atual no SALIC</p>
          <p className="mt-1">{alert.project?.situacao || "—"}</p>
        </div>
        {meta.exitedAt ? (
          <div className="sm:col-span-2 rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-[#176b3a]">
            Saiu de diligência em {formatDateTime(new Date(meta.exitedAt))}
            {meta.exitedTo ? ` (agora: ${meta.exitedTo})` : ""}. Resolva o alerta quando conferir.
          </div>
        ) : null}
        {alert.seenAt ? (
          <p className="text-[var(--gray-500)]">
            Visto por {who(alert.seenById)} em {formatDateTime(alert.seenAt)}
          </p>
        ) : null}
        {alert.resolvedAt ? (
          <p className="text-[var(--gray-500)]">
            Resolvido por {who(alert.resolvedById)} em {formatDateTime(alert.resolvedAt)}
            {alert.resolutionNote ? ` — “${alert.resolutionNote}”` : ""}
          </p>
        ) : null}
      </section>

      {alert.status !== "RESOLVIDO" ? (
        <section className="card space-y-4 p-5">
          {alert.status === "NOVO" ? (
            <form action={markAlertSeen.bind(null, alert.id)}>
              <button type="submit" className="btn btn-ghost">
                Marcar como visto
              </button>
            </form>
          ) : null}
          <form action={resolveAlert.bind(null, alert.id)} className="space-y-3">
            <label className="block text-sm font-medium text-[var(--navy)]" htmlFor="note">
              O que foi feito (opcional)
            </label>
            <textarea id="note" name="note" rows={3} className="field w-full" maxLength={2000} />
            <button type="submit" className="btn">
              Resolver alerta
            </button>
          </form>
        </section>
      ) : (
        <form action={reopenAlert.bind(null, alert.id)}>
          <button type="submit" className="btn btn-ghost">
            Reabrir
          </button>
        </form>
      )}
    </div>
  );
}
