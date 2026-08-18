"use client";

import { useActionState } from "react";
import { MaxCulturalLogoLink } from "@/components/BrandLogo";
import { completePasswordChangeAction, type AuthActionState } from "@/lib/actions/auth";

const initial: AuthActionState = {};

export default function OnboardingSenhaPage() {
  const [state, action, pending] = useActionState(completePasswordChangeAction, initial);
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <MaxCulturalLogoLink href="/login" />
        <h1 className="auth-title">Nova senha</h1>
        <p className="auth-lead">Defina uma senha forte (10+ caracteres, maiúscula, dígito e símbolo).</p>
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
          <button type="submit" className="btn w-full" disabled={pending}>
            Salvar
          </button>
        </form>
      </div>
    </div>
  );
}
