import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, safeContinueUrl } from "@max/auth";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { LoginForm } from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth";
import { recaptchaSiteKey } from "@/lib/recaptcha";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const nextRaw = typeof sp.next === "string" ? sp.next : "/";
  const next = safeContinueUrl(nextRaw, "/");

  const user = await getSessionUser();
  if (user) {
    // Já logado de verdade (sessionVersion ok) — evita tela de login.
    if (next.startsWith("http://") || next.startsWith("https://")) {
      redirect(next);
    }
    redirect(next.startsWith("/") ? next : "/");
  }

  // Cookie fantasma de sessão (papel/permissões alterados / senha resetada).
  // Não dá para alterar cookies em RSC — redireciona para Route Handler.
  // Não apaga max_pending_2fa (fluxo do código por e-mail).
  const jar = await cookies();
  if (jar.get(AUTH_COOKIE)?.value) {
    const loginPath =
      next && next !== "/"
        ? `/login?next=${encodeURIComponent(next)}`
        : "/login";
    redirect(
      `/api/auth/clear-session-cookie?next=${encodeURIComponent(loginPath)}`,
    );
  }

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
