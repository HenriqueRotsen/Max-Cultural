import { Suspense } from "react";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { RedefinirForm } from "@/components/RedefinirForm";

export const metadata = { title: "Redefinir senha" };

export default function RedefinirPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/login" />
        <h1 className="auth-title">Nova senha</h1>
        <p className="auth-lead">
          Defina uma senha forte (10+ caracteres, maiúscula, dígito e símbolo).
        </p>
        <Suspense fallback={<p className="text-sm text-[var(--gray-500)]">Carregando…</p>}>
          <RedefinirForm />
        </Suspense>
      </div>
    </div>
  );
}
