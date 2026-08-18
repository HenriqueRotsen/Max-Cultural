import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth/actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Recuperar senha" };

export default async function RecuperarSenhaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;

  return (
    <>
      <h1 className="auth-title">Recuperar senha</h1>
      <p className="auth-lead">
        Enviaremos um link para redefinir a senha, se o e-mail estiver cadastrado.
      </p>
      {error && <p className="auth-alert">{error}</p>}
      {ok && <p className="auth-ok">{ok}</p>}
      <form action={requestPasswordReset} className="mt-5 space-y-4">
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <button type="submit" className="btn w-full">
          Enviar link
        </button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/login" className="font-semibold text-[var(--navy)] underline-offset-2 hover:underline">
          Voltar ao login
        </Link>
      </p>
    </>
  );
}
