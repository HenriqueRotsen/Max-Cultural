"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { uploadPaymentProof, type ActionState } from "@/lib/planning/actions";

const initial: ActionState = {};

export function ProofUploadForm({
  commitmentId,
  kind,
  label,
  hint,
}: {
  commitmentId: string;
  kind: "PAYMENT_PROOF" | "TAX_PROOF";
  label: string;
  /** Ex.: rateio em N rubricas */
  hint?: string;
}) {
  const router = useRouter();
  const action = uploadPaymentProof.bind(null, commitmentId);
  const [state, formAction, pending] = useActionState(action, initial);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      {hint ? (
        <p className="text-xs text-[var(--gray-500)]">{hint}</p>
      ) : null}
      {state.error ? (
        <p className="text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p
          className={`text-sm ${
            state.message?.includes("Atenção")
              ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
              : "text-emerald-700"
          }`}
        >
          {state.message || "Arquivo salvo."}
        </p>
      ) : null}
      <label className="field">
        <span>{label}</span>
        <input name="proofFile" type="file" accept=".pdf,image/*" required />
      </label>
      <button type="submit" className="btn" disabled={pending}>
        {pending
          ? "Enviando…"
          : kind === "PAYMENT_PROOF"
            ? "Enviar comprovante"
            : "Enviar"}
      </button>
    </form>
  );
}
