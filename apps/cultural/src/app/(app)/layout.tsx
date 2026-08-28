import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { can, getSessionUser, needs2faSetup, needsPasswordChange } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (needsPasswordChange(user)) redirect("/onboarding/senha");
  if (needs2faSetup(user)) redirect("/onboarding/2fa");

  const origemUrl = (process.env.NEXT_PUBLIC_ORIGEM_URL || "http://localhost:3001").replace(
    /\/$/,
    "",
  );
  const fluxoUrl = (process.env.NEXT_PUBLIC_FLUXO_URL || "http://localhost:3002").replace(
    /\/$/,
    "",
  );

  return (
    <div className="shell">
      <AppSidebar
        userEmail={user.email}
        canUsers={can(user, "cultural.usuarios", "view")}
        canRoles={can(user, "cultural.papeis", "view")}
        canLogs={can(user, "cultural.logs", "view")}
        canOrigem={can(user, "origem.app", "view")}
        canFluxo={can(user, "fluxo.app", "view")}
        origemUrl={origemUrl}
        fluxoUrl={fluxoUrl}
      />
      <div className="shell-main">
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
