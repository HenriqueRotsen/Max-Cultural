import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { DemoBanner } from "@/components/DemoBanner";
import { NotificationBell } from "@/components/planning/NotificationBell";
import { isAuthEnabled, isDemoMode, isDevOpenAuth, needsLogin } from "@/lib/auth/config";
import { origemHubLoginUrl } from "@/lib/auth/hub";
import { getSessionUser, getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  enabledNotificationTypes,
} from "@/lib/planning/notification-settings";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { notificationVisibleWhere } from "@/lib/planning/reminder-dates";

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
                ? [{ OR: [{ userId }, { userId: null }] as const }]
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
  if (!needsLogin()) {
    const { entitlements, session } = await getWorkspaceContext();
    const demo = isDemoMode();
    return (
      <div className="shell">
        <AppSidebar
          userEmail={demo ? "demonstração" : isDevOpenAuth() ? "dev aberto" : undefined}
          isAdmin={!demo && isDevOpenAuth()}
          syncEnabled={!demo && entitlements.syncEnabled}
          demoMode={demo}
        />
        <div className="shell-main">
          <DemoBanner />
          <TopBar
            workspaceId={entitlements.workspaceId}
            userId={session?.id}
          />
          <div className="content">{children}</div>
        </div>
      </div>
    );
  }

  const session = await getSessionUser();
  if (!session) {
    redirect(origemHubLoginUrl("/painel"));
  }
  if (session.profile.mustChangePassword && isAuthEnabled()) {
    redirect("/alterar-senha");
  }

  return (
    <div className="shell">
      <AppSidebar
        userEmail={session.email}
        isAdmin={session.profile.role === "ADMIN"}
        syncEnabled={session.entitlements.syncEnabled}
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
