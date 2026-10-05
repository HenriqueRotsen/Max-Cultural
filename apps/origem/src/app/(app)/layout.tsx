import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/planning/NotificationBell";
import { isAuthEnabled } from "@/lib/auth/config";
import { origemHubLoginUrl, origemHubLogoutUrl } from "@/lib/auth/hub";
import {
  getHubPermissions,
  hubScreenForPath,
} from "@/lib/auth/hub-permissions";
import { getHubSessionPayload } from "@/lib/auth/hub";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  enabledNotificationTypes,
} from "@/lib/planning/notification-settings";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { notificationVisibleWhere } from "@/lib/planning/reminder-dates";
import { culturalDeniedUrl } from "@max/auth";

async function TopBar({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId?: string;
}) {
  const prefs = await getNotificationPrefs(workspaceId, userId);
  const enabledTypes = enabledNotificationTypes(prefs);

  const notifications =
    enabledTypes.length === 0
      ? []
      : await prisma.appNotification.findMany({
          where: {
            workspaceId,
            type: { in: enabledTypes },
            AND: [
              notificationVisibleWhere(),
              ...(userId
                ? [{ OR: [{ userId }, { userId: null }] }]
                : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        });

  return (
    <div className="flex items-center justify-end gap-3 border-b border-[var(--border)] px-6 py-2">
      <NotificationBell
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
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, hubPerms] = await Promise.all([getSessionUser(), getHubPermissions()]);
  if (!session) {
    redirect(origemHubLoginUrl("/painel"));
  }
  // Sessão revogada no hub: /logout do Cultural limpa o cookie (ir a /login faria loop).
  if (hubPerms.revoked) {
    redirect(origemHubLogoutUrl());
  }
  if (session.profile.mustChangePassword && isAuthEnabled()) {
    redirect("/alterar-senha");
  }

  const canEnterOrigem =
    hubPerms.ids.has("origem.app") ||
    hubPerms.ids.has("*") ||
    // SSO válido + API do hub indisponível: não trancar a entrada no produto.
    (Boolean(hubPerms.fetchFailed) && Boolean(await getHubSessionPayload()));
  if (!canEnterOrigem) {
    redirect(culturalDeniedUrl("Sem acesso ao MAX Origem."));
  }

  // Para o menu: se o fetch falhou mas o SSO está ok, libera telas básicas.
  const allowedScreens = hubPerms.fetchFailed
    ? [
        "origem.app",
        "origem.planejamento",
        "origem.proponentes",
        "origem.auditoria",
        "origem.fornecedores",
      ]
    : [...hubPerms.ids];

  const h = await headers();
  const pathname =
    h.get("x-pathname") ||
    h.get("x-invoke-path") ||
    h.get("next-url") ||
    "";
  // Fallback: Next 16 pode não enviar path no layout — gate fino nas páginas via helper.
  if (pathname && !hubPerms.fetchFailed) {
    const screen = hubScreenForPath(pathname);
    if (screen && !hubPerms.ids.has(screen) && !hubPerms.ids.has("*")) {
      redirect("/painel");
    }
  }

  return (
    <div className="shell">
      <AppSidebar
        userEmail={session.email}
        isAdmin={session.profile.role === "ADMIN"}
        syncEnabled={session.entitlements.syncEnabled}
        allowedScreens={allowedScreens}
      />
      <div className="shell-main">
        <TopBar
          workspaceId={session.workspace.id}
          userId={session.id}
        />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
