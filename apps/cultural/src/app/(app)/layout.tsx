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

  const financeiroUrl = (process.env.NEXT_PUBLIC_FINANCEIRO_URL || "http://localhost:3001").replace(
    /\/$/,
    "",
  );
  const indicadoresUrl = (process.env.NEXT_PUBLIC_INDICADORES_URL || "http://localhost:3002").replace(
    /\/$/,
    "",
  );


  const auditoriaUrl =
    (can(user, "auditoria.app", "view") || can(user, "financeiro.auditoria", "view")) &&
    process.env.NEXT_PUBLIC_AUDITORIA_URL
      ? process.env.NEXT_PUBLIC_AUDITORIA_URL.replace(/\/$/, "")
      : "";

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
        canFinanceiro={can(user, "financeiro.app", "view")}
        canIndicadores={can(user, "indicadores.app", "view")}
        indicadoresFormulariosOnly={
          user.role.name === "Professor" ||
          (can(user, "indicadores.app", "view") &&
            !can(user, "indicadores.operacao", "view") &&
            !can(user, "indicadores.consultas", "view"))
        }
        financeiroUrl={financeiroUrl}
        indicadoresUrl={indicadoresUrl}
        auditoriaUrl={auditoriaUrl}
      />
      <div className="shell-main" data-mx-main>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
