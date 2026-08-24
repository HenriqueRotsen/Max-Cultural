"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { verifyTotpLoginAction, type AuthActionState } from "@/lib/actions/auth";
import { useClientRedirect } from "@/lib/use-client-redirect";

const initial: AuthActionState = {};

export function TwoFactorForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [state, action, pending] = useActionState(verifyTotpLoginAction, initial);
  useClientRedirect(state.redirectTo);

  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="code">Código do autenticador</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          pattern="[0-9]{6}"
          maxLength={6}
        />
      </div>
      {state.error ? <p className="auth-alert">{state.error}</p> : null}
      <button type="submit" className="btn w-full" disabled={pending || !!state.redirectTo}>
        {pending || state.redirectTo ? "Verificando…" : "Confirmar"}
      </button>
    </form>
  );
}
