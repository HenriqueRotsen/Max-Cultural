import { Suspense } from "react";
import Link from "next/link";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/" />
        <h1 className="auth-title">Entrar no MAX Cultural</h1>
        <p className="auth-lead">Senha e, em seguida, o código do autenticador.</p>
        <Suspense fallback={<p className="text-sm text-[var(--gray-500)]">Carregando…</p>}>
          <LoginForm />
        </Suspense>
        <p className="mt-4 text-sm text-[var(--gray-500)]">
          <Link href="/login/recuperar" className="font-semibold text-[var(--navy)] underline-offset-2 hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </div>
  );
}
