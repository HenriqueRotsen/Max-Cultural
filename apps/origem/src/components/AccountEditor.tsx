"use client";

import { useState } from "react";
import Link from "next/link";
import {
  clearAccountPassword,
  deleteAccount,
  updateAccount,
} from "@/lib/actions";
import { FieldHelp, FieldLabel } from "@/components/FieldHelp";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { formatCgccpf } from "@/lib/format";
import { HELP } from "@/lib/help";

type AccountEditorProps = {
  syncEnabled?: boolean;
  account: {
    id: string;
    name: string;
    cgccpf: string;
    salicUsername: string | null;
    hasPassword: boolean;
    extraPronacs: string | null;
    personType: "PJ" | "PF" | "MEI";
    active: boolean;
    projectCount: number;
    institutionalMap?: boolean;
  };
};

export function AccountEditor({ account, syncEnabled = true }: AccountEditorProps) {
  const [editingPassword, setEditingPassword] = useState(false);
  const digits = account.cgccpf.replace(/\D/g, "");
  const showMapa = digits.length === 14 || account.personType === "PJ";
  const mapLabel = account.institutionalMap
    ? "Mapa organizacional"
    : "Mapa societário";

  return (
    <div id={`account-${account.id}`} className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">{account.name}</h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            {account.cgccpf}
            <span className="mx-1.5 text-[var(--gray-300)]">·</span>
            {account.personType}
            <span className="mx-1.5 text-[var(--gray-300)]">·</span>
            {account.projectCount} projeto{account.projectCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showMapa ? (
            <Link href={`/contas/mapa/${account.id}`} className="btn btn-ghost">
              {mapLabel}
            </Link>
          ) : null}
          {syncEnabled && (
            <span className={`badge ${account.hasPassword ? "badge-success" : "badge-muted"}`}>
              {account.hasPassword ? "Senha salva" : "Sem senha"}
            </span>
          )}
          <span className={`badge ${account.active ? "badge-success" : "badge-muted"}`}>
            {syncEnabled
              ? account.active
                ? "Atualização ligada"
                : "Atualização pausada"
              : account.active
                ? "Ativa"
                : "Inativa"}
          </span>
        </div>
      </div>

      <div className="p-5">
        <form action={updateAccount.bind(null, account.id)} className="grid gap-4 md:grid-cols-2">
          <div className="field">
            <FieldLabel htmlFor={`cgccpf-${account.id}`} help={HELP.cgccpf}>
              CNPJ/CPF
            </FieldLabel>
            <input
              id={`cgccpf-${account.id}`}
              name="cgccpf"
              defaultValue={account.cgccpf}
              required
              onBlur={(e) => {
                const formatted = formatCgccpf(e.target.value);
                if (formatted !== "—") e.target.value = formatted;
              }}
            />
          </div>
          <div className="field">
            <FieldLabel htmlFor={`name-${account.id}`}>Nome do proponente</FieldLabel>
            <input id={`name-${account.id}`} name="name" defaultValue={account.name} required />
          </div>

          <div className="field">
            <FieldLabel htmlFor={`personType-${account.id}`} help={HELP.personType}>
              Tipo de proponente
            </FieldLabel>
            <select
              id={`personType-${account.id}`}
              name="personType"
              defaultValue={account.personType}
            >
              <option value="PJ">Empresa (PJ) — até 20%</option>
              <option value="PF">Pessoa física — até 30%</option>
              <option value="MEI">MEI — até 30%</option>
            </select>
          </div>

          {syncEnabled ? (
            <>
              <div className="field">
                <FieldLabel htmlFor={`user-${account.id}`} help={HELP.salicUser}>
                  Usuário do SALIC
                </FieldLabel>
                <input
                  id={`user-${account.id}`}
                  name="salicUsername"
                  defaultValue={account.salicUsername || ""}
                  autoComplete="username"
                  placeholder="Opcional"
                />
              </div>

              <div className="field md:col-span-2">
                <FieldLabel htmlFor={`pass-${account.id}`} help={HELP.salicPass}>
                  Senha do SALIC
                </FieldLabel>
                {account.hasPassword && !editingPassword ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id={`pass-${account.id}`}
                      type="password"
                      value="••••••••"
                      readOnly
                      disabled
                      className="min-w-[12rem] flex-1"
                      aria-label="Senha cadastrada (oculta)"
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setEditingPassword(true)}
                    >
                      Alterar senha
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      id={`pass-${account.id}`}
                      name="salicPassword"
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        account.hasPassword
                          ? "Nova senha para substituir a cadastrada"
                          : "Opcional — só para o Salink atualizar os dados"
                      }
                    />
                    {account.hasPassword && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setEditingPassword(false)}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}

          <div className="field md:col-span-2">
            <FieldLabel htmlFor={`extra-${account.id}`} help={HELP.extraPronacs}>
              Projetos extras (PRONAC)
            </FieldLabel>
            <input
              id={`extra-${account.id}`}
              name="extraPronacs"
              defaultValue={account.extraPronacs || ""}
              placeholder="153774, 193461"
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--gray-600)]">
              <input type="checkbox" name="active" defaultChecked={account.active} />
              <span className="inline-flex items-center gap-1.5 font-medium">
                {syncEnabled ? "Manter atualização automática ligada" : "Conta ativa"}
                {syncEnabled && <FieldHelp text={HELP.active} />}
              </span>
            </label>
            <ConfirmSubmitButton
              className="btn"
              title="Salvar alterações"
              confirmLabel="Salvar"
              message="Confirmar as alterações desta conta?"
            >
              Salvar alterações
            </ConfirmSubmitButton>
          </div>
        </form>

        <div className="account-section flex flex-wrap gap-2">
          {syncEnabled && account.hasPassword && (
            <form action={clearAccountPassword.bind(null, account.id)}>
              <ConfirmSubmitButton
                className="btn btn-ghost"
                message="Remover a senha SALIC salva desta conta?"
              >
                Remover senha salva
              </ConfirmSubmitButton>
            </form>
          )}
          <form action={deleteAccount.bind(null, account.id)}>
            <ConfirmSubmitButton
              className="btn btn-ghost"
              message={`Remover a conta "${account.name}" e todos os dados vinculados? Esta ação não pode ser desfeita.`}
            >
              Remover conta
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
