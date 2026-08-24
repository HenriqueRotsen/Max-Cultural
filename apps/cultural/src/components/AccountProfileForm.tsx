"use client";

import { useActionState } from "react";
import type { AuthActionState } from "@/lib/actions/auth";
import {
  changeOwnPasswordAction,
  updateOwnProfileAction,
} from "@/lib/actions/account";

const initial: AuthActionState = {};

export function AccountProfileForm({ name }: { name: string }) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateOwnProfileAction,
    initial,
  );
  const [passState, passAction, passPending] = useActionState(
    changeOwnPasswordAction,
    initial,
  );

  return (
    <div className="space-y-6">
      <form action={profileAction} className="card space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">Dados pessoais</h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            O e-mail da conta não pode ser alterado aqui.
          </p>
        </div>
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" name="name" defaultValue={name} required minLength={2} />
        </div>
        {profileState.message ? (
          <p className="text-sm text-[#176b3a]">{profileState.message}</p>
        ) : null}
        {profileState.error ? <p className="auth-alert">{profileState.error}</p> : null}
        <button type="submit" className="btn" disabled={profilePending}>
          {profilePending ? "Salvando…" : "Salvar nome"}
        </button>
      </form>

      <form action={passAction} className="card space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">Alterar senha</h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            Use a senha atual e uma nova senha forte (mínimo 10 caracteres, letra
            maiúscula, minúscula, número e símbolo).
          </p>
        </div>
        <div className="field">
          <label htmlFor="current">Senha atual</label>
          <input id="current" name="current" type="password" required autoComplete="current-password" />
        </div>
        <div className="field">
          <label htmlFor="password">Nova senha</label>
          <input id="password" name="password" type="password" required autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirmar nova senha</label>
          <input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
        </div>
        {passState.message ? (
          <p className="text-sm text-[#176b3a]">{passState.message}</p>
        ) : null}
        {passState.error ? <p className="auth-alert">{passState.error}</p> : null}
        <button type="submit" className="btn" disabled={passPending}>
          {passPending ? "Atualizando…" : "Atualizar senha"}
        </button>
      </form>
    </div>
  );
}
