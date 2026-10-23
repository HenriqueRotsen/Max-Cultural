"use client";

import { useActionState, useState } from "react";
import { completePasswordChangeAction, type AuthActionState } from "@/lib/actions/auth";
import { useClientRedirect } from "@/lib/use-client-redirect";
import { NewPasswordFields } from "@/components/NewPasswordFields";

const initial: AuthActionState = {};

export function PasswordChangeForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(completePasswordChangeAction, initial);
  const [valid, setValid] = useState(false);
  useClientRedirect(state.redirectTo);

  return (
    <form action={action} className="mt-5 space-y-4">
      <NewPasswordFields email={email} onValidChange={setValid} />
      {state.error ? <p className="auth-alert">{state.error}</p> : null}
      <button
        type="submit"
        className="btn w-full"
        disabled={pending || !!state.redirectTo || !valid}
        title={valid ? undefined : "Atenda todos os requisitos e confirme a senha para continuar."}
      >
        {pending || state.redirectTo ? "Salvando…" : "Salvar nova senha"}
      </button>
      {!valid ? (
        <p className="text-center text-xs text-[var(--gray-500)]">
          O botão será liberado quando todos os requisitos estiverem marcados em verde.
        </p>
      ) : null}
    </form>
  );
}
