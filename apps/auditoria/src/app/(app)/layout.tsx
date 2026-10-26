import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { origemHubLoginUrl, origemHubLogoutUrl } from "@/lib/auth/hub";
import { canEnterAuditoria, getHubPermissions } from "@/lib/auth/hub-permissions";
import { getHubSessionPayload } from "@/lib/auth/hub";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { culturalDeniedUrl } from "@max/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, hubPerms] = await Promise.all([getSessionUser(), getHubPermissions()]);
  if (!session) {
    redirect(origemHubLoginUrl("/inicio"));
  }
  // Sessão revogada no hub: /logout do Cultural limpa o cookie (ir a /login faria loop).
  if (hubPerms.revoked) {
    redirect(origemHubLogoutUrl());
  }

  const canEnter =
    canEnterAuditoria(hubPerms.ids) ||
    // SSO válido + API do hub indisponível: não trancar a entrada no produto.
    (Boolean(hubPerms.fetchFailed) && Boolean(await getHubSessionPayload()));
  if (!canEnter) {
    redirect(culturalDeniedUrl("Sem acesso à Auditoria."));
  }

  const newAlerts = await prisma.auditAlert.count({
    where: { workspaceId: session.workspace.id, status: "NOVO" },
  });

  return (
    <div className="shell">
      <AppSidebar
        userEmail={session.email}
        isAdmin={session.profile.role === "ADMIN"}
        syncEnabled={session.entitlements.syncEnabled}
        newAlerts={newAlerts}
      />
      <div className="shell-main" data-mx-main>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
