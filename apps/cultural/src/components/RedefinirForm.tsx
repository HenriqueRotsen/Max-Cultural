"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/PasswordInput";
import {
  resetPasswordWithTokenAction,
  type AuthActionState,
} from "@/lib/actions/auth";
import { useClientRedirect } from "@/lib/use-client-redirect";

const initial: AuthActionState = {};

export function RedefinirForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [state, action, pending] = useActionState(resetPasswordWithTokenAction, initial);
  useClientRedirect(state.redirectTo);

  if (!token) {
    return (
      <p className="auth-alert mt-5">
        Link inválido. Solicite um novo em Recuperar senha.
      </p>
    );
  }

  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="password">Senha</label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirmar</label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
        />
      </div>
      {state.error ? <p className="auth-alert">{state.error}</p> : null}
      {state.message && !state.redirectTo ? (
        <p className="text-sm text-[var(--navy)]">{state.message}</p>
      ) : null}
      <button
        type="submit"
        className="btn w-full"
        disabled={pending || !!state.redirectTo}
      >
        {pending || state.redirectTo ? "Salvando…" : "Salvar senha"}
      </button>
    </form>
  );
}
