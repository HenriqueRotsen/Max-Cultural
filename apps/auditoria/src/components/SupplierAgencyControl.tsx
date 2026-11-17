"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSupplierAgency } from "@/lib/actions";

const fmt = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/**
 * Fornecedor agência: só um percentual do que foi pago conta nos limites de
 * fornecedor e de vínculo. Mesmo cadastro do MAX Financeiro.
 */
export function SupplierAgencyControl({
  cgccpf,
  agencyPct,
}: {
  cgccpf: string;
  agencyPct: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isAgency, setIsAgency] = useState(agencyPct != null);
  const [value, setValue] = useState(agencyPct != null ? String(agencyPct).replace(".", ",") : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {agencyPct != null ? (
          <span
            className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"
            title="Só este percentual do que é pago conta nos limites de fornecedor e de vínculo."
          >
            Agência · {fmt(agencyPct)} conta nos limites
          </span>
        ) : null}
        <button
          type="button"
          className="text-xs font-semibold text-[var(--navy)] underline-offset-2 hover:underline"
          onClick={() => setEditing(true)}
        >
          {agencyPct != null ? "Alterar agência" : "Marcar como agência"}
        </button>
      </div>
    );
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await setSupplierAgency({ cgccpf, pct: isAgency ? value : null });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="card max-w-xl space-y-2 p-4">
      <label className="flex items-center gap-2 text-sm font-medium text-[var(--navy)]">
        <input
          type="checkbox"
          checked={isAgency}
          disabled={pending}
          onChange={(e) => setIsAgency(e.target.checked)}
        />
        É agência (intermediária)
      </label>
      <p className="text-xs text-[var(--gray-500)]">
        Só o percentual abaixo do que for pago a este fornecedor conta nos limites de fornecedor e
        de vínculo, aqui e no MAX Financeiro.
      </p>
      {isAgency ? (
        <label className="field max-w-[14rem]">
          <span>Percentual que conta nos limites</span>
          <span className="flex items-center gap-1">
            <input
              inputMode="decimal"
              placeholder="10"
              value={value}
              disabled={pending}
              onChange={(e) => setValue(e.target.value)}
            />
            <span className="text-sm text-[var(--gray-500)]">%</span>
          </span>
        </label>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn"
          disabled={pending || (isAgency && !value.trim())}
          onClick={save}
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => setEditing(false)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
