import { redirect } from "next/navigation";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { getSessionUser, needsPasswordChange } from "@/lib/auth";

export const metadata = { title: "Nova senha" };

export default async function OnboardingSenhaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!needsPasswordChange(user)) {
    redirect("/");
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/login" />
        <h1 className="auth-title">Crie sua nova senha</h1>
        <p className="auth-lead">
          Sua senha atual é provisória. Crie uma senha forte — a lista abaixo mostra, enquanto
          você digita, o que já foi atendido. Em seguida enviaremos um código de verificação
          para o seu e-mail.
        </p>
        <PasswordChangeForm email={user.email} />
      </div>
    </div>
  );
}
