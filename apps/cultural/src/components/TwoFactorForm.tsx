"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  resendLoginEmailOtpAction,
  type AuthActionState,
} from "@/lib/actions/auth";

export function TwoFactorForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const error = params.get("error");
  const [resendState, setResendState] = useState<AuthActionState>({});
  const [pendingResend, startResend] = useTransition();

  return (
    <div className="mt-5 space-y-4">
      <form action="/api/auth/2fa" method="post" className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="code">Código do e-mail</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
          />
        </div>
        {error ? <p className="auth-alert">{error}</p> : null}
        {resendState.error ? <p className="auth-alert">{resendState.error}</p> : null}
        {resendState.message ? (
          <p className="text-sm text-[var(--navy)]">{resendState.message}</p>
        ) : null}
        <button type="submit" className="btn w-full">
          Confirmar
        </button>
      </form>
      <button
        type="button"
        className="btn btn-ghost w-full"
        disabled={pendingResend}
        onClick={() => {
          startResend(async () => {
            setResendState(await resendLoginEmailOtpAction());
          });
        }}
      >
        {pendingResend ? "Reenviando…" : "Reenviar código"}
      </button>
    </div>
  );
}
