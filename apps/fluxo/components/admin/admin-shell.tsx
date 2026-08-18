import { redirect } from "next/navigation";
import { AppSidebarLayout } from "@/components/admin/app-sidebar-layout";
import { requireDashboardUser } from "@/lib/dashboard-gate";
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
      <div className="min-h-screen bg-[linear-gradient(180deg,var(--brand-mist)_0%,#faf8f5_42%,#f3efe8_100%)]">
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    );
  }

  const user = await requireDashboardUser();
  const permissions = await getEffectivePermissions(user.id);
  if (!permissions.has("dashboard:access") && !permissions.has("perfil:write")) {
    redirect("/dashboard/login");
  }

  return (
    <AppSidebarLayout
      userName={user.name}
      userEmail={user.email}
      roleName={user.role?.name}
      permissions={[...permissions]}
      title={title}
      contentClassName="mx-auto w-full max-w-7xl"
    >
      {children}
    </AppSidebarLayout>
  );
}
