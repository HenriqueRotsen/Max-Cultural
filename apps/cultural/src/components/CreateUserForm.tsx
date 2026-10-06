"use client";

import { useState } from "react";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { RecaptchaForm, RecaptchaLegalNote } from "@/components/RecaptchaV3";
import { createUserAction } from "@/lib/actions/iam";

export function CreateUserForm({
  siteKey = "",
  roles,
}: {
  siteKey?: string;
  roles: { id: string; name: string }[];
}) {
  const [botError, setBotError] = useState<string | null>(null);

  return (
    <>
      <RecaptchaForm
        action="signup"
        siteKey={siteKey}
        formAction={createUserAction}
        className="card space-y-3 p-5"
        onError={setBotError}
      >
        <h2 className="font-semibold text-[var(--navy)]">Novo usuário</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="field">
            <label htmlFor="name">Nome</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="roleId">Papel</label>
            <select id="roleId" name="roleId" required defaultValue={roles[0]?.id}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {botError ? <p className="auth-alert">{botError}</p> : null}
        <ConfirmSubmitButton
          className="btn"
          message="Criar este usuário e enviar o convite por e-mail?"
          confirmLabel="Criar"
        >
          Criar
        </ConfirmSubmitButton>
      </RecaptchaForm>
      {siteKey ? <RecaptchaLegalNote /> : null}
    </>
  );
}
