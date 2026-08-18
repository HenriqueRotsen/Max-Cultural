"use client";

import { useState, useTransition } from "react";
import { adminUpdateUserContact } from "@/lib/auth/actions";
import { lookupCep } from "@/lib/actions";
import {
  ContactAddressFields,
  type ContactAddressValues,
} from "@/components/ContactAddressFields";

type Props = {
  userId: string;
  defaults: ContactAddressValues;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCep(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatPhoneDisplay(digits: string) {
  const d = onlyDigits(digits).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function UserContactEditor({ userId, defaults }: Props) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<ContactAddressValues>({
    ...defaults,
    contactPhone: formatPhoneDisplay(defaults.contactPhone),
    addressZip: formatCep(defaults.addressZip),
  });
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
      setCepStatus("Endereço atualizado pelo CEP");
    });
  }

  const hasContact = Boolean(defaults.contactPhone || defaults.addressZip);

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--gray-500)]">
          {hasContact
            ? `${defaults.contactPhone || "—"} · ${defaults.addressCity || "—"}${
                defaults.addressState ? `/${defaults.addressState}` : ""
              }`
            : "Sem contato/endereço cadastrado"}
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Fechar" : "Editar contato"}
        </button>
      </div>

      {open && (
        <form
          action={adminUpdateUserContact}
          className="mt-3 grid gap-4 rounded-xl border border-[var(--border)] p-4 md:grid-cols-2"
        >
          <input type="hidden" name="id" value={userId} />
          <ContactAddressFields
            idPrefix={userId}
            values={contact}
            onChange={patchContact}
            onCepBlur={onCepBlur}
            cepPending={cepPending}
          />
          {cepStatus && (
            <p className="md:col-span-2 text-xs text-[var(--gray-500)]">{cepStatus}</p>
          )}
          <div className="md:col-span-2">
            <button type="submit" className="btn" disabled={cepPending}>
              Salvar contato e endereço
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
