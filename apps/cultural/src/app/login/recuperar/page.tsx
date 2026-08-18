"use client";

import { useActionState } from "react";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { requestPasswordResetAction, type AuthActionState } from "@/lib/actions/auth";

const initial: AuthActionState = {};

export default function RecuperarPage() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/login" />
        <h1 className="auth-title">Recuperar senha</h1>
        <p className="auth-lead">Enviamos o link se o e-mail existir. Sem key Resend, o envio fica só no log.</p>
        <form action={action} className="mt-5 space-y-4">
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" required />
          </div>
          {state.error ? <p className="auth-alert">{state.error}</p> : null}
          {state.message ? <p className="text-sm text-[var(--navy)]">{state.message}</p> : null}
          <button type="submit" className="btn w-full" disabled={pending}>
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
