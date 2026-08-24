"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type AuthActionState } from "@/lib/actions/auth";
import { useClientRedirect } from "@/lib/use-client-redirect";

const initial: AuthActionState = {};

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [state, action, pending] = useActionState(loginAction, initial);
  useClientRedirect(state.redirectTo);

  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="next" value={next} />
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
      {state.error ? <p className="auth-alert">{state.error}</p> : null}
      <button type="submit" className="btn w-full" disabled={pending || !!state.redirectTo}>
        {pending || state.redirectTo ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
