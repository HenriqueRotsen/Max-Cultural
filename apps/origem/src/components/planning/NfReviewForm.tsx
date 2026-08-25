"use client";

import { useActionState } from "react";
import { confirmNfReservation, type ActionState } from "@/lib/planning/actions";
import type { ExtractedNf } from "@/lib/nf/extract";
import { formatCurrency } from "@/lib/format";

const initial: ActionState = {};

type LineOpt = {
  id: string;
  label: string;
  available: number;
};

export function NfReviewForm({
  documentId,
  extracted,
  lines,
  complianceWarning,
}: {
  documentId: string;
  extracted: ExtractedNf;
  lines: LineOpt[];
  complianceWarning?: string | null;
}) {
  const action = confirmNfReservation.bind(null, documentId);
  const [state, formAction, pending] = useActionState(action, initial);
  const firstItem = extracted.items?.[0];
  const defaultAmount = extracted.totalPrice ?? firstItem?.price ?? 0;
  const visibleLines = lines.filter((l) => l.available > 0);

  return (
    <form action={formAction} className="card space-y-4 p-5">
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {complianceWarning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {complianceWarning}
        </p>
      ) : null}
      <p className="text-xs text-[var(--gray-500)]">
        A reserva usa o orçamento vigente de cada rubrica. Para redistribuir valores entre
        linhas (exceder uma com saldo de outra), use <strong>Editar rubricas</strong> na
        página do projeto.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span>CNPJ</span>
          <input name="cnpj" required defaultValue={extracted.cnpj || ""} className="w-full" />
        </label>
        <label className="field">
          <span>Fornecedor</span>
          <input
            name="supplierName"
            required
            defaultValue={extracted.supplierName || ""}
            className="w-full"
          />
        </label>
        <label className="field sm:col-span-2">
          <span>Serviço / descrição</span>
          <input
            name="serviceName"
            required
            defaultValue={extracted.serviceDescription || firstItem?.name || ""}
            className="w-full"
          />
        </label>
        <label className="field">
          <span>Valor</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={defaultAmount || ""}
            className="w-full"
          />
        </label>
        <label className="field">
          <span>Data da NF</span>
          <input
            name="hiredAt"
            type="date"
            defaultValue={extracted.hiredAt || ""}
            className="w-full"
          />
        </label>
        <label className="field sm:col-span-2">
          <span>Rubrica</span>
          <select name="budgetLineId" required className="w-full" defaultValue="">
            <option value="" disabled>
              Selecione a rubrica com saldo…
            </option>
            {visibleLines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label} — saldo {formatCurrency(l.available)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="hasBond" className="mt-1" />
        <span>
          Este fornecedor tem vínculo com o proponente nesta IN (conta no teto do
          proponente / Observado).
        </span>
      </label>

      <button
        type="submit"
        className="btn"
        disabled={pending || visibleLines.length === 0}
      >
        {pending ? "Reservando…" : "Confirmar NF e reservar rubrica"}
      </button>
    </form>
  );
}
