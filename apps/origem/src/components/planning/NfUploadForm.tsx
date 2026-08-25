"use client";

import { useActionState } from "react";
import { uploadNfForReview, type ActionState } from "@/lib/planning/actions";

const initial: ActionState = {};

export function NfUploadForm({ planningProjectId }: { planningProjectId: string }) {
  const action = uploadNfForReview.bind(null, planningProjectId);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="card space-y-4 p-5" encType="multipart/form-data">
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <label className="field">
        <span>Nota fiscal (PDF ou XML)</span>
        <input name="nfFile" type="file" accept=".pdf,.xml,application/pdf,text/xml" required />
      </label>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Extraindo…" : "Enviar e extrair"}
      </button>
    </form>
  );
}
