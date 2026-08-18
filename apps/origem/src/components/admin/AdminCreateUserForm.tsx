"use client";

import { useState, useTransition } from "react";
import { adminCreateUser } from "@/lib/auth/actions";
import { lookupCep } from "@/lib/actions";
import { PlanMaxAccountsFields } from "@/components/admin/PlanMaxAccountsFields";
import {
  ContactAddressFields,
  emptyContactAddress,
  type ContactAddressValues,
} from "@/components/ContactAddressFields";
import { PasswordHints } from "@/components/auth/PasswordHints";

type WorkspaceOption = {
  id: string;
  name: string;
  plan: "ESSENTIAL" | "PRO";
  maxAccounts: number;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCep(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function AdminCreateUserForm({ workspaces }: { workspaces: WorkspaceOption[] }) {
  const [contact, setContact] = useState<ContactAddressValues>(emptyContactAddress);
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [cepPending, startCepTransition] = useTransition();

  function patchContact(patch: Partial<ContactAddressValues>) {
    setContact((prev) => ({ ...prev, ...patch }));
  }

  function onCepBlur(value: string) {
    const digits = onlyDigits(value);
    if (digits.length !== 8) return;
    startCepTransition(async () => {
      const result = await lookupCep(digits);
      if (!result.found) {
        setCepStatus(result.error || "CEP não encontrado");
        return;
      }
      patchContact({
        addressZip: formatCep(result.zip),
        ...(result.street ? { addressStreet: result.street } : {}),
        ...(result.complement ? { addressComplement: result.complement } : {}),
        ...(result.neighborhood ? { addressNeighborhood: result.neighborhood } : {}),
        addressCity: result.city,
        addressState: result.state,
      });
      setCepStatus("Endereço preenchido pelo CEP. Confira o número.");
    });
  }

  return (
    <form action={adminCreateUser} className="card grid gap-4 p-5 md:grid-cols-2">
      <h2 className="md:col-span-2 text-base font-semibold text-[var(--navy)]">Novo acesso</h2>
      <div className="field">
        <label htmlFor="name">Nome</label>
        <input id="name" name="name" placeholder="Opcional" />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail de acesso</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && !contact.contactEmail) {
              patchContact({ contactEmail: value });
            }
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="role">Perfil</label>
        <select id="role" name="role" defaultValue="USER">
          <option value="USER">Usuário</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </div>
      <PlanMaxAccountsFields defaultPlan="ESSENTIAL" defaultMaxAccounts={10} />
      <div className="field">
        <label htmlFor="workspaceName">Nome do workspace</label>
        <input id="workspaceName" name="workspaceName" placeholder="Empresa / cliente" />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="workspaceId">Ou adicionar a workspace existente</label>
        <select id="workspaceId" name="workspaceId" defaultValue="">
          <option value="">Criar novo workspace</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} · {w.plan === "PRO" ? "Pro" : "Essencial"} · até {w.maxAccounts} conta
              {w.maxAccounts === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </div>

      <ContactAddressFields
        values={contact}
        onChange={patchContact}
        onCepBlur={onCepBlur}
        cepPending={cepPending}
      />
      {cepStatus && (
        <p className="md:col-span-2 text-xs text-[var(--gray-500)]">{cepStatus}</p>
      )}

      <div className="field md:col-span-2">
        <label htmlFor="tempPassword">Senha temporária (opcional)</label>
        <input
          id="tempPassword"
          name="tempPassword"
          type="text"
          placeholder="Deixe em branco para gerar automaticamente"
          autoComplete="off"
        />
      </div>
      <div className="md:col-span-2">
        <PasswordHints />
      </div>
      <div className="md:col-span-2">
        <button type="submit" className="btn" disabled={cepPending}>
          Criar usuário
        </button>
      </div>
    </form>
  );
}
