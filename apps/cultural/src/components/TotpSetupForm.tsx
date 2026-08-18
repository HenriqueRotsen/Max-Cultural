"use client";

import { useActionState, useEffect, useState } from "react";
import {
  confirmTotpSetupAction,
  startTotpSetupAction,
  type AuthActionState,
} from "@/lib/actions/auth";

const initial: AuthActionState = {};

export function TotpSetupForm() {
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(confirmTotpSetupAction, initial);

  useEffect(() => {
    startTotpSetupAction().then((res) => {
      if (res.ok) {
        setSecret(res.secret);
        setQr(res.qrDataUrl);
      } else {
        setBootError(res.error);
      }
    });
  }, []);

  return (
    <div className="mt-5 space-y-4">
      {bootError ? <p className="auth-alert">{bootError}</p> : null}
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR do autenticador" className="mx-auto rounded-lg border" width={220} height={220} />
      ) : null}
      {secret ? (
        <p className="text-center text-xs text-[var(--gray-500)] break-all">
          Chave: {secret}
        </p>
      ) : null}
      <form action={action} className="space-y-4">
        <div className="field">
          <label htmlFor="code">Digite o código de 6 dígitos</label>
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
        <button type="submit" className="btn w-full" disabled={pending || !secret}>
          {pending ? "Confirmando…" : "Ativar 2FA"}
        </button>
      </form>
    </div>
  );
}
