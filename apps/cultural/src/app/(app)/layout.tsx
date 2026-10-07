import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AccessDeniedDialog } from "@/components/AccessDeniedDialog";
import { AppSidebar } from "@/components/AppSidebar";
import { can, getSessionUser, needsPasswordChange } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Sessão revogada (ex.: troca de papel) → login limpa cookie fantasma.
  if (!user) redirect("/login");
  if (needsPasswordChange(user)) redirect("/onboarding/senha");

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
      <Suspense fallback={null}>
        <AccessDeniedDialog />
      </Suspense>
      <AppSidebar
        userEmail={user.email}
        canUsers={can(user, "cultural.usuarios", "view")}
        canRoles={can(user, "cultural.papeis", "view")}
        canLogs={can(user, "cultural.logs", "view")}
        canOrigem={can(user, "origem.app", "view")}
        canFluxo={can(user, "fluxo.app", "view")}
        fluxoFormulariosOnly={
          user.role.name === "Professor" ||
          (can(user, "fluxo.app", "view") &&
            !can(user, "fluxo.operacao", "view") &&
            !can(user, "fluxo.consultas", "view"))
        }
        origemUrl={origemUrl}
        fluxoUrl={fluxoUrl}
      />
      <div className="shell-main">
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
