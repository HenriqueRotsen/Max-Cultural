import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { can, getSessionUser, needs2faSetup, needsPasswordChange } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (needsPasswordChange(user)) redirect("/onboarding/senha");
  if (needs2faSetup(user)) redirect("/onboarding/2fa");

  return (
    <div className="shell">
      <AppSidebar
        userEmail={user.email}
        canUsers={can(user, "cultural.usuarios", "view")}
        canRoles={can(user, "cultural.papeis", "view")}
        canLogs={can(user, "cultural.logs", "view")}
      />
      <div className="shell-main">
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
