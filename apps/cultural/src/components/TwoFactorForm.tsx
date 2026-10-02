"use client";

import { useSearchParams } from "next/navigation";

export function TwoFactorForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const error = params.get("error");

  return (
    <form action="/api/auth/2fa" method="post" className="mt-5 space-y-4">
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
      {error ? <p className="auth-alert">{error}</p> : null}
      <button type="submit" className="btn w-full">
        Confirmar
      </button>
    </form>
  );
}
