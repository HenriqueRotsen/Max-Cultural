"use client";

import { useActionState } from "react";
import { uploadPaymentProof, type ActionState } from "@/lib/planning/actions";

const initial: ActionState = {};

export function ProofUploadForm({
  commitmentId,
  kind,
  label,
}: {
  commitmentId: string;
  kind: "PAYMENT_PROOF" | "TAX_PROOF";
  label: string;
}) {
  const action = uploadPaymentProof.bind(null, commitmentId);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-3" encType="multipart/form-data">
      <input type="hidden" name="kind" value={kind} />
      {state.error ? (
        <p className="text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-emerald-700">Arquivo salvo.</p>
      ) : null}
      <label className="field">
        <span>{label}</span>
        <input name="proofFile" type="file" accept=".pdf,image/*" required />
      </label>
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? "Enviando…" : "Enviar"}
      </button>
    </form>
  );
}
