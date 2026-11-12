"use client";

import { useActionState, useState } from "react";
import { SearchSelect } from "@max/ui";
import { registerSalicPayment } from "@/lib/planning/manual-commitment";
import type { ActionState } from "@/lib/planning/action-state";

const initial: ActionState = {};

export function RegisterSalicPaymentForm({
  recordId,
  needsRubric,
  lines,
}: {
  recordId: string;
  needsRubric: boolean;
  lines: Array<{ id: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    registerSalicPayment.bind(null, recordId),
    initial,
  );
  const [kind, setKind] = useState<"NF" | "RPA">("NF");
  return (
    <form action={formAction} className="card space-y-4 p-5">
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="documentKind" value={kind} />
      <div className="flex gap-2">
        {(["NF", "RPA"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`btn ${kind === k ? "" : "btn-ghost"}`}
            aria-pressed={kind === k}
          >
            {k === "NF" ? "Nota fiscal" : "Recibo (RPA)"}
          </button>
        ))}
      </div>
      {needsRubric ? (
        <label className="field">
          <span>Rubrica</span>
          <SearchSelect
            name="budgetLineId"
            required
            options={lines.map((l) => ({ value: l.id, label: l.label }))}
            placeholder="Escolha a rubrica"
          />
        </label>
      ) : null}
      <label className="field">
        <span>Arquivo da {kind === "NF" ? "nota fiscal" : "RPA"}</span>
        <input type="file" name="nfFile" accept=".pdf,.xml,image/*" required />
      </label>
      <label className="field sm:max-w-xs">
        <span>Número da {kind === "NF" ? "NFS-e" : "RPA"}</span>
        <input name="fiscalNumber" required placeholder={kind === "NF" ? "Ex.: 3628" : "Ex.: 26/2026"} />
      </label>
      <label className="field">
        <span>Comprovante de pagamento</span>
        <input type="file" name="proofFile" accept=".pdf,image/*" required />
      </label>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Conferindo…" : "Conferir e registrar"}
      </button>
    </form>
  );
}
