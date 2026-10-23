import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { RecoverPasswordForm } from "@/components/RecoverPasswordForm";
import { PasswordRulesPreview } from "@/components/PasswordRulesPreview";
import { recaptchaSiteKey } from "@/lib/recaptcha";

export const metadata = { title: "Recuperar senha" };

export default function RecuperarPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/login" />
        <h1 className="auth-title">Recuperar senha</h1>
        <p className="auth-lead">
          Se o e-mail existir, enviaremos uma senha temporária. No próximo acesso você
          deverá criar uma senha nova.
        </p>
        <RecoverPasswordForm siteKey={recaptchaSiteKey()} />
        <PasswordRulesPreview title="Ao entrar com a senha temporária, você criará uma nova senha com:" />
      </div>
    </div>
  );
}
