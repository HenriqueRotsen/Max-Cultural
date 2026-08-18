import { updatePassword } from "@/lib/auth/actions";
import { PasswordHints } from "@/components/auth/PasswordHints";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Alterar senha" };

export default async function AlterarSenhaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <>
      <h1 className="auth-title">Trocar senha temporária</h1>
      <p className="auth-lead">
        Por segurança, escolha uma senha forte antes de usar o Salink.
      </p>
      {error && <p className="auth-alert">{error}</p>}
      <form action={updatePassword} className="mt-5 space-y-4">
        <input type="hidden" name="returnTo" value="/alterar-senha" />
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
          Continuar para o Salink
        </button>
      </form>
    </>
  );
}
