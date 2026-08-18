import { redirect } from "next/navigation";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { TotpSetupForm } from "@/components/TotpSetupForm";
import { getSessionUser, needs2faSetup } from "@/lib/auth";

export const metadata = { title: "Configurar 2FA" };

export default async function Onboarding2faPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!needs2faSetup(user)) redirect("/");

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/" />
        <h1 className="auth-title">Ativar autenticador</h1>
        <p className="auth-lead">
          O 2FA é obrigatório. Escaneie o QR no app autenticador e confirme o código.
        </p>
        <TotpSetupForm />
      </div>
    </div>
  );
}
