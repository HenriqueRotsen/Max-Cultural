"use client";

import { useActionState } from "react";
import { completePasswordChangeAction, type AuthActionState } from "@/lib/actions/auth";
import { useClientRedirect } from "@/lib/use-client-redirect";

const initial: AuthActionState = {};

export function PasswordChangeForm() {
  const [state, action, pending] = useActionState(completePasswordChangeAction, initial);
  useClientRedirect(state.redirectTo);

  return (
    <form action={action} className="mt-5 space-y-4">
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" required />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirmar</label>
        <input id="confirm" name="confirm" type="password" required />
      </div>
      {state.error ? <p className="auth-alert">{state.error}</p> : null}
      <button type="submit" className="btn w-full" disabled={pending || !!state.redirectTo}>
        {pending || state.redirectTo ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
