import { Suspense } from "react";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { TwoFactorForm } from "@/components/TwoFactorForm";

export const metadata = { title: "Verificar código" };

export default function Login2faPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/login" />
        <h1 className="auth-title">Código de verificação</h1>
        <p className="auth-lead">
          Enviamos um código de 6 dígitos para o e-mail cadastrado. Digite-o abaixo
          para concluir o login.
        </p>
        <Suspense fallback={<p className="text-sm text-[var(--gray-500)]">Carregando…</p>}>
          <TwoFactorForm />
        </Suspense>
      </div>
    </div>
  );
}
