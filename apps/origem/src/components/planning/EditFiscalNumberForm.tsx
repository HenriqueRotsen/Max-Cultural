"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  updateImportedFiscalNumber,
  type ActionState,
} from "@/lib/planning/actions";
import {
  fiscalNumberSalicLabel,
  fiscalNumberSalicPlaceholder,
} from "@/lib/nf/fiscal-number";

const initial: ActionState = {};

export function EditFiscalNumberForm({
  documentId,
  kind,
  currentNumber,
  compact = false,
  onUpdated,
}: {
  documentId: string;
  kind: "NF" | "RPA";
  currentNumber: string | null;
  compact?: boolean;
  onUpdated?: (fiscalNumber: string) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const handledOkRef = useRef(false);
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;
  const action = updateImportedFiscalNumber.bind(null, documentId);
  const [state, formAction, pending] = useActionState(action, initial);

  useEffect(() => {
    if (!state.ok) {
      handledOkRef.current = false;
      return;
    }
    if (handledOkRef.current) return;
    handledOkRef.current = true;
    router.refresh();
    const value = inputRef.current?.value.trim();
    if (value) onUpdatedRef.current?.(value);
  }, [state.ok, router]);

  return (
    <form action={formAction} className={compact ? "space-y-2" : "space-y-3"}>
      <label className="field">
        <span>{fiscalNumberSalicLabel(kind)}</span>
        <input
          ref={inputRef}
          name="fiscalNumber"
          required
          defaultValue={currentNumber || ""}
          placeholder={fiscalNumberSalicPlaceholder(kind)}
          className="w-full tabular-nums"
          disabled={pending}
        />
      </label>
      <button
        type="submit"
        className={`btn btn-ghost ${compact ? "w-full text-xs" : ""}`}
        disabled={pending}
      >
        {pending ? "Salvando…" : "Salvar número"}
      </button>
      {state.error ? (
        <p className="text-xs text-red-700">{state.error}</p>
      ) : state.message ? (
        <p className="text-xs text-emerald-800">{state.message}</p>
      ) : null}
    </form>
  );
}
