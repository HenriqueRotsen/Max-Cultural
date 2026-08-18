import { Suspense } from "react";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { TwoFactorForm } from "@/components/TwoFactorForm";

export const metadata = { title: "Verificar 2FA" };

export default function Login2faPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/login" />
        <h1 className="auth-title">Código de verificação</h1>
        <p className="auth-lead">Abra o app autenticador e digite os 6 dígitos.</p>
        <Suspense fallback={<p className="text-sm text-[var(--gray-500)]">Carregando…</p>}>
          <TwoFactorForm />
        </Suspense>
      </div>
    </div>
  );
}
