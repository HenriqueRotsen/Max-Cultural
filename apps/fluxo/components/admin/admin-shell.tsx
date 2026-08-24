import { AppSidebarLayout } from "@/components/admin/app-sidebar-layout";
import { requireDashboardUser } from "@/lib/dashboard-gate";
import { redirectToHubLogin } from "@/lib/hub";
import { getEffectivePermissions } from "@/lib/permissions";

export async function AdminShell({
  children,
  title,
  skipGate = false,
}: {
  children: React.ReactNode;
  title?: string;
  /** Páginas de onboarding / login não usam o gate completo */
  skipGate?: boolean;
}) {
  if (skipGate) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,var(--navy-soft)_0%,var(--background)_42%,var(--background)_100%)]">
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    );
  }

  const user = await requireDashboardUser();
  const permissions = await getEffectivePermissions(user.id);
  if (!permissions.has("dashboard:access")) {
    redirectToHubLogin("/dashboard");
  }

  return (
    <AppSidebarLayout
      userEmail={user.email}
      permissions={[...permissions]}
      title={title}
      contentClassName="mx-auto w-full max-w-7xl"
    >
      {children}
    </AppSidebarLayout>
  );
}
