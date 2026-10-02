"use client";

import { useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/PasswordInput";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const error = params.get("error");

  return (
    <form action="/api/auth/login" method="post" className="mt-5 space-y-4">
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
      <button type="submit" className="btn w-full">
        Entrar
      </button>
    </form>
  );
}
