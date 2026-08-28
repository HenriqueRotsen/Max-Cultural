import Link from "next/link";
import type { AppNotificationType } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui";
import { NotificationSettingsForm } from "@/components/planning/NotificationSettingsForm";
import {
  MarkAllNotificationsButton,
  NotificationsList,
} from "@/components/planning/NotificationsList";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  enabledNotificationTypes,
  NOTIFICATION_TYPE_META,
} from "@/lib/planning/notification-settings";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { refreshPaymentDueNotifications } from "@/lib/planning/actions";
import { notificationVisibleWhere } from "@/lib/planning/reminder-dates";

export const dynamic = "force-dynamic";

export default async function NotificacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const { type = "", status = "" } = await searchParams;

  await refreshPaymentDueNotifications({ force: true }).catch(() => undefined);

  const prefs = await getNotificationPrefs(
    entitlements.workspaceId,
    session.id,
  );
  const enabledTypes = enabledNotificationTypes(prefs);

  const typeFilter =
    type && enabledTypes.includes(type as AppNotificationType)
      ? (type as AppNotificationType)
      : null;

  const notifications = await prisma.appNotification.findMany({
    where: {
      workspaceId: entitlements.workspaceId,
      AND: [
        notificationVisibleWhere(),
        { OR: [{ userId: session.id }, { userId: null }] },
      ],
      type: typeFilter
        ? typeFilter
        : enabledTypes.length > 0
          ? { in: enabledTypes }
          : { in: [] },
      ...(status === "unread"
        ? { readAt: null }
        : status === "read"
          ? { readAt: { not: null } }
          : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={<>Notificações</>}
        title="Notificações"
        description={
          unreadCount > 0
            ? `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`
            : "Todas as lidas ou sem avisos ativos"
        }
        actions={<MarkAllNotificationsButton />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <form className="card flex flex-wrap items-end gap-3 p-4">
            <label className="field min-w-[12rem]">
              <span>Tipo</span>
              <select name="type" defaultValue={type} className="w-full">
                <option value="">Todos (ativos)</option>
                {(
                  Object.keys(NOTIFICATION_TYPE_META) as AppNotificationType[]
                ).map((t) => (
                  <option key={t} value={t} disabled={!enabledTypes.includes(t)}>
                    {NOTIFICATION_TYPE_META[t].label}
                    {!enabledTypes.includes(t) ? " (desligado)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field min-w-[10rem]">
              <span>Status</span>
              <select name="status" defaultValue={status} className="w-full">
                <option value="">Todas</option>
                <option value="unread">Não lidas</option>
                <option value="read">Lidas</option>
              </select>
            </label>
            <button type="submit" className="btn">
              Filtrar
            </button>
            {type || status ? (
              <Link href="/notificacoes" className="btn btn-ghost">
                Limpar
              </Link>
            ) : null}
          </form>

          <NotificationsList
            items={notifications.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              href: n.href,
              type: n.type,
              createdAt: n.createdAt.toISOString(),
              readAt: n.readAt?.toISOString() || null,
            }))}
          />
        </div>

        <NotificationSettingsForm prefs={prefs} userEmail={session.email} />
      </div>
    </div>
  );
}
