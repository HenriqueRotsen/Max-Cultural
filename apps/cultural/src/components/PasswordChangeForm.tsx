"use client";

import { useActionState } from "react";
import { completePasswordChangeAction, type AuthActionState } from "@/lib/actions/auth";
import { useClientRedirect } from "@/lib/use-client-redirect";
import { PasswordInput } from "@/components/PasswordInput";

const initial: AuthActionState = {};

export function PasswordChangeForm() {
  const [state, action, pending] = useActionState(completePasswordChangeAction, initial);
  useClientRedirect(state.redirectTo);

  return (
    <form action={action} className="mt-5 space-y-4">
      <div className="field">
        <label htmlFor="password">Senha</label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirmar</label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
        />
      </div>
      {state.error ? <p className="auth-alert">{state.error}</p> : null}
      <button type="submit" className="btn w-full" disabled={pending || !!state.redirectTo}>
        {pending || state.redirectTo ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
