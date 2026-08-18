import { updatePassword } from "@/lib/auth/actions";
import { PasswordHints } from "@/components/auth/PasswordHints";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Redefinir senha" };

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <>
      <h1 className="auth-title">Nova senha</h1>
      <p className="auth-lead">
        Defina uma senha forte para continuar. Se abriu pelo e-mail de recuperação, você já está
        autenticado nesta etapa.
      </p>
      {error && <p className="auth-alert">{error}</p>}
      <form action={updatePassword} className="mt-5 space-y-4">
        <input type="hidden" name="returnTo" value="/redefinir-senha" />
        <div className="field">
          <label htmlFor="password">Nova senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirmar senha</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <PasswordHints />
        <button type="submit" className="btn w-full">
          Salvar senha
        </button>
      </form>
    </>
  );
}
