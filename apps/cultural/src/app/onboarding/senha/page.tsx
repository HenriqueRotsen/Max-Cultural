import { redirect } from "next/navigation";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { getSessionUser, needs2faSetup, needsPasswordChange } from "@/lib/auth";

export const metadata = { title: "Nova senha" };

export default async function OnboardingSenhaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!needsPasswordChange(user)) {
    redirect(needs2faSetup(user) ? "/onboarding/2fa" : "/");
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/login" />
        <h1 className="auth-title">Nova senha</h1>
        <p className="auth-lead">Defina uma senha forte (10+ caracteres, maiúscula, dígito e símbolo).</p>
        <PasswordChangeForm />
      </div>
    </div>
  );
}
