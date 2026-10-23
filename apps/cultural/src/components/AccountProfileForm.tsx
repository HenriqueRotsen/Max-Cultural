"use client";

import { useActionState, useState } from "react";
import type { AuthActionState } from "@/lib/actions/auth";
import {
  changeOwnPasswordAction,
  updateOwnProfileAction,
} from "@/lib/actions/account";
import { PasswordInput } from "@/components/PasswordInput";
import { NewPasswordFields } from "@/components/NewPasswordFields";

const initial: AuthActionState = {};

export function AccountProfileForm({ name, email }: { name: string; email?: string }) {
  const [newPassValid, setNewPassValid] = useState(false);
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
            Informe a senha atual e crie uma nova. Os requisitos ficam verdes conforme
            você digita.
          </p>
        </div>
        <div className="field">
          <label htmlFor="current">Senha atual</label>
          <PasswordInput
            id="current"
            name="current"
            required
            autoComplete="current-password"
          />
        </div>
        <NewPasswordFields
          key={passState.message ?? "nova-senha"}
          email={email}
          onValidChange={setNewPassValid}
        />
        {passState.message ? (
          <p className="text-sm text-[#176b3a]">{passState.message}</p>
        ) : null}
        {passState.error ? <p className="auth-alert">{passState.error}</p> : null}
        <button type="submit" className="btn" disabled={passPending || !newPassValid}>
          {passPending ? "Atualizando…" : "Atualizar senha"}
        </button>
      </form>
    </div>
  );
}
