"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { PronacOverrideField } from "@/components/planning/PronacOverrideField";
import { uploadTaxDocuments } from "@/lib/planning/tax-actions";
import type { ActionState } from "@/lib/planning/action-state";
import { TAX_DOC_TYPES, TAX_KIND_LABELS, type TaxKind } from "@/lib/planning/tax-docs";

const initial: ActionState = {};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type TaxPaymentOption = {
  nfId: string;
  label: string;
  taxes: Array<{ kind: TaxKind; label: string; amount: number }>;
  /** Impostos que já têm documentos lançados. */
  done: TaxKind[];
};

export function TaxDocumentsForm({
  planningProjectId,
  payments,
  initialNfId,
}: {
  planningProjectId: string;
  payments: TaxPaymentOption[];
  initialNfId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    uploadTaxDocuments.bind(null, planningProjectId),
    initial,
  );
  const [nfId, setNfId] = useState(
    payments.some((p) => p.nfId === initialNfId) ? initialNfId! : (payments[0]?.nfId ?? ""),
  );
  const chosen = payments.find((p) => p.nfId === nfId);
  const kinds: Array<{ kind: TaxKind; label: string }> = chosen?.taxes.length
    ? chosen.taxes.map((t) => ({
        kind: t.kind,
        label: `${t.label} · ${brl(t.amount)}${chosen.done.includes(t.kind) ? " (já lançado)" : ""}`,
      }))
    : (Object.keys(TAX_KIND_LABELS) as TaxKind[]).map((k) => ({ kind: k, label: TAX_KIND_LABELS[k] }));

  if (payments.length === 0) {
    return (
      <p className="text-sm text-[var(--gray-500)]">
        Nenhum pagamento com nota neste projeto ainda. O imposto é lançado no pagamento de uma NF/RPA.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <label className="field">
        <span>Pagamento</span>
        <select name="nfId" value={nfId} onChange={(e) => setNfId(e.target.value)} required>
          {payments.map((p) => (
            <option key={p.nfId} value={p.nfId}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Imposto</span>
        <select key={nfId} name="taxKind" required defaultValue={kinds[0]?.kind}>
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        {chosen && chosen.taxes.length === 0 ? (
          <span className="text-xs text-[var(--gray-500)]">Esta nota não mostra imposto retido.</span>
        ) : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="field">
          <span>{TAX_DOC_TYPES.GUIA}</span>
          <input name="guiaFile" type="file" accept=".pdf,image/*" required />
        </label>
        <label className="field">
          <span>{TAX_DOC_TYPES.NF_IMPOSTO} (se houver)</span>
          <input name="taxNfFile" type="file" accept=".pdf,.xml,image/*" />
        </label>
        <label className="field">
          <span>{TAX_DOC_TYPES.COMPROVANTE}</span>
          <input name="proofFile" type="file" accept=".pdf,image/*" required />
        </label>
      </div>
      {state.pronacOverride ? <PronacOverrideField allowed /> : null}
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.ok ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.message?.includes("Atenção")
              ? "border border-amber-200 bg-amber-50 text-amber-900"
              : "text-emerald-700"
          }`}
        >
          {state.message}{" "}
          {state.id ? (
            <Link href={`/planejamento/compromissos/${state.id}`} className="font-semibold underline">
              Ver pagamento
            </Link>
          ) : null}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Enviando…" : "Lançar imposto"}
      </button>
    </form>
  );
}
