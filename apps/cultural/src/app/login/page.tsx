import { Suspense } from "react";
import Link from "next/link";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { LoginForm } from "@/components/LoginForm";
import { recaptchaSiteKey } from "@/lib/recaptcha";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  const siteKey = recaptchaSiteKey();
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/" />
        <h1 className="auth-title">Entrar no MAX Cultural</h1>
        <p className="auth-lead">
          Informe e-mail e senha. Em seguida enviaremos um código para o seu e-mail.
        </p>
        <Suspense fallback={<p className="text-sm text-[var(--gray-500)]">Carregando…</p>}>
          <LoginForm siteKey={siteKey} />
        </Suspense>
        <p className="mt-4 text-sm text-[var(--gray-500)]">
          <Link
            href="/login/recuperar"
            className="font-semibold text-[var(--navy)] underline-offset-2 hover:underline"
          >
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </div>
  );
}
