"use client";

import { useActionState, useState } from "react";
import { RecaptchaForm, RecaptchaLegalNote } from "@/components/RecaptchaV3";
import { requestPasswordResetAction, type AuthActionState } from "@/lib/actions/auth";

const initial: AuthActionState = {};

export function RecoverPasswordForm({ siteKey = "" }: { siteKey?: string }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  const [botError, setBotError] = useState<string | null>(null);

  return (
    <>
      <RecaptchaForm
        action="password_reset"
        siteKey={siteKey}
        formAction={action}
        className="mt-5 space-y-4"
        onError={setBotError}
      >
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required />
        </div>
        {state.error ? <p className="auth-alert">{state.error}</p> : null}
        {botError ? <p className="auth-alert">{botError}</p> : null}
        {state.message ? (
          <p className="text-sm text-[var(--navy)]">{state.message}</p>
        ) : null}
        <button type="submit" className="btn w-full" disabled={pending}>
          Enviar senha temporária
        </button>
      </RecaptchaForm>
      {siteKey ? <RecaptchaLegalNote /> : null}
    </>
  );
}
