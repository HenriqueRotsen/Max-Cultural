"use client";

import { useActionState, useState } from "react";
import { evaluateSupplier } from "@/lib/planning/evaluation";
import type { ActionState } from "@/lib/planning/action-state";

/** Avaliação do fornecedor após o pagamento: estrelas + prazo/atraso + comentário. */
export function SupplierEvaluationForm({
  commitmentId,
  supplierName,
  initial,
}: {
  commitmentId: string;
  supplierName: string;
  initial: {
    rating: number | null;
    delayed: boolean;
    delayDays: number | null;
    comment: string | null;
    evaluatedAt: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    evaluateSupplier.bind(null, commitmentId),
    {},
  );
  const [rating, setRating] = useState(initial.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [onTime, setOnTime] = useState<"" | "sim" | "nao">(
    initial.evaluatedAt ? (initial.delayed ? "nao" : "sim") : "",
  );
  const shown = hover || rating;

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-[var(--gray-600)]">
        Como foi o serviço de <strong>{supplierName}</strong>? A nota e o prazo vão para o histórico
        do fornecedor no módulo Fornecedores.
      </p>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
          Nota
        </p>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
              aria-pressed={rating === n}
              className={`text-2xl leading-none ${n <= shown ? "text-[var(--gold)]" : "text-[var(--gray-200)]"}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
            >
              ★
            </button>
          ))}
        </div>
        <input type="hidden" name="rating" value={rating || ""} />
      </div>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
          Entregou no prazo?
        </legend>
        <div className="flex gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="onTime" value="sim" checked={onTime === "sim"} onChange={() => setOnTime("sim")} />
            Sim
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="onTime" value="nao" checked={onTime === "nao"} onChange={() => setOnTime("nao")} />
            Não, atrasou
          </label>
        </div>
      </fieldset>

      {onTime === "nao" ? (
        <label className="field max-w-[12rem]">
          <span className="text-xs text-[var(--gray-500)]">Dias de atraso</span>
          <input type="number" name="delayDays" min={1} defaultValue={initial.delayDays ?? undefined} required />
        </label>
      ) : null}

      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Comentário (opcional)</span>
        <textarea name="comment" rows={2} maxLength={2000} defaultValue={initial.comment ?? ""} />
      </label>

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-700">{state.message}</p> : null}

      <button type="submit" className="btn" disabled={pending || !rating || !onTime}>
        {pending ? "Salvando…" : initial.evaluatedAt ? "Atualizar avaliação" : "Salvar avaliação"}
      </button>
    </form>
  );
}
