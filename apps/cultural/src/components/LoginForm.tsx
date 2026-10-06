"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/PasswordInput";
import { RecaptchaForm } from "@/components/RecaptchaV3";

export function LoginForm({ siteKey = "" }: { siteKey?: string }) {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const error = params.get("error");
  const [botError, setBotError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onError = useCallback((message: string) => {
    setBotError(message || null);
  }, []);

  return (
    <RecaptchaForm
      action="login"
      siteKey={siteKey}
      formAction="/api/auth/login"
      method="post"
      className="mt-5 space-y-4"
      onError={onError}
      onBusyChange={setBusy}
    >
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="auth-alert">{error}</p> : null}
      {botError ? <p className="auth-alert">{botError}</p> : null}
      <button type="submit" className="btn w-full" disabled={busy}>
        {busy ? "Verificando…" : "Entrar"}
      </button>
    </RecaptchaForm>
  );
}
