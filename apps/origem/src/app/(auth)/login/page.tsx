import { redirect } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth/actions";
import { culturalLoginUrl, isHubSsoEnabled } from "@/lib/auth/hub";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (isHubSsoEnabled()) {
    redirect(culturalLoginUrl("/painel"));
  }

  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <>
      <h1 className="auth-title">Entrar no MAX Origem</h1>
      <p className="auth-lead">Use o e-mail e a senha fornecidos pelo administrador.</p>
      {error && <p className="auth-alert">{error}</p>}
      <form action={signIn} className="mt-5 space-y-4">
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit" className="btn w-full">
          Entrar
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--gray-500)]">
        <Link href="/recuperar-senha" className="font-semibold text-[var(--navy)] underline-offset-2 hover:underline">
          Esqueci minha senha
        </Link>
      </p>
    </>
  );
}
