import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { DemoBanner } from "@/components/DemoBanner";
import { isDemoMode, isDevOpenAuth, needsLogin } from "@/lib/auth/config";
import { getSessionUser, getWorkspaceContext } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Dev aberto / demo: sem login, workspace bootstrap.
  if (!needsLogin()) {
    const { entitlements } = await getWorkspaceContext();
    const demo = isDemoMode();
    return (
      <div className="shell">
        <AppSidebar
          userEmail={demo ? "demonstração" : isDevOpenAuth() ? "dev aberto" : undefined}
          isAdmin={!demo && isDevOpenAuth()}
          syncEnabled={!demo && entitlements.syncEnabled}
          planLabel={demo ? "Demo" : entitlements.planLabel}
          demoMode={demo}
        />
        <div className="shell-main">
          <DemoBanner />
          <div className="content">{children}</div>
        </div>
      </div>
    );
  }

  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }
  if (session.profile.mustChangePassword) {
    redirect("/alterar-senha");
  }

  return (
    <div className="shell">
      <AppSidebar
        userEmail={session.email}
        syncEnabled={session.entitlements.syncEnabled}
        planLabel={session.entitlements.planLabel}
      />
      <div className="shell-main">
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
