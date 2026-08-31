"use client";

import { useActionState, useMemo, useState } from "react";
import { uploadAdvancePayment } from "@/lib/planning/manual-commitment";
import type { ActionState } from "@/lib/planning/action-state";
import { formatCgccpfInput } from "@/lib/format";
import { MoneyInput } from "@/components/MoneyInput";
import {
  RubricAllocationFields,
  allocationsJsonFromRows,
  type AllocRow,
} from "@/components/planning/RubricAllocationFields";
import type { RubricSelectOption } from "@/components/planning/RubricSearchSelect";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";

const initial: ActionState = {};

function StepBadge({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-400)]">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--navy)] text-[11px] font-bold text-white">
        {n}
      </span>
      {label}
    </span>
  );
}

export function AdvancePaymentForm({
  planningProjectId,
  lines,
  defaultNfReminderAt,
}: {
  planningProjectId: string;
  lines: RubricSelectOption[];
  defaultNfReminderAt: string;
}) {
  const action = uploadAdvancePayment.bind(null, planningProjectId);
  const [state, formAction, pending] = useActionState(action, initial);
  const defaultLineId = lines[0]?.id || "";
  const [allocs, setAllocs] = useState<AllocRow[]>([
    { budgetLineId: defaultLineId, sharePct: "100" },
  ]);
  const [amount, setAmount] = useState<number | null>(null);
  const [cnpj, setCnpj] = useState("");
  const [proofName, setProofName] = useState("");

  const gross = amount ?? 0;
  const allocationsJson = useMemo(
    () => allocationsJsonFromRows(allocs),
    [allocs],
  );
  const shareSum = useMemo(() => {
    try {
      const parsed = JSON.parse(allocationsJson) as Array<{ sharePct: number }>;
      return parsed.reduce((s, a) => s + a.sharePct, 0);
    } catch {
      return 0;
    }
  }, [allocationsJson]);
  const hasDuplicateLines = useMemo(() => {
    const ids = allocs.map((a) => a.budgetLineId).filter(Boolean);
    return ids.length !== new Set(ids).size;
  }, [allocs]);
  const canSubmit =
    !pending &&
    gross > 0 &&
    lines.length > 0 &&
    Math.abs(shareSum - 100) <= 0.05 &&
    !hasDuplicateLines &&
    allocs.every((a) => a.budgetLineId);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M20 6 9 17l-5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--navy)]">Já conta como pago</p>
            <p className="mt-0.5 text-xs text-[var(--gray-500)]">
              O saldo da rubrica baixa na hora.
            </p>
          </div>
        </div>
        <div className="card flex items-start gap-3 border-amber-200 bg-amber-50/50 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-950">NF pendente</p>
            <p className="mt-0.5 text-xs text-amber-900/80">
              Fica marcado até anexar a nota.
            </p>
          </div>
        </div>
        <div className="card flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--navy-soft)] text-[var(--navy)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M14 2v6h6M16 13H8m8 4H8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--navy)]">Regularize depois</p>
            <p className="mt-0.5 text-xs text-[var(--gray-500)]">
              Anexe NF/RPA quando receber.
            </p>
          </div>
        </div>
      </div>

      <form
        action={formAction}
        className="card space-y-6 p-5 sm:p-6"
      >
        {state.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </p>
        ) : null}

        <input type="hidden" name="allocationsJson" value={allocationsJson} />

        <section className="space-y-4">
          <StepBadge n={1} label="Valor e rateio" />
          <div className="grid gap-4">
            <label className="field sm:max-w-xs">
              <span>Valor total pago (R$)</span>
              <MoneyInput
                name="amount"
                value={amount}
                onChange={setAmount}
                required
              />
            </label>
            <RubricAllocationFields
              lines={lines}
              gross={gross}
              allocs={allocs}
              onChange={setAllocs}
            />
          </div>
        </section>

        <section className="space-y-4 border-t border-[var(--border)] pt-6">
          <StepBadge n={2} label="Fornecedor" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              <span>Nome</span>
              <input name="supplierName" required placeholder="Razão social ou nome" />
            </label>
            <label className="field">
              <span>CPF / CNPJ</span>
              <input
                name="cnpj"
                value={cnpj}
                onChange={(e) => setCnpj(formatCgccpfInput(e.target.value))}
                required
                placeholder="00.000.000/0000-00"
                className="tabular-nums"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 border-t border-[var(--border)] pt-6">
          <StepBadge n={3} label="Comprovante" />
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--gray-50)] px-4 py-8 text-center transition hover:border-[var(--navy)] hover:bg-[var(--navy-soft)]">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[var(--navy)] shadow-sm">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect
                  x="2"
                  y="5"
                  width="20"
                  height="14"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold text-[var(--navy)]">
                {proofName ? "Trocar comprovante" : "Enviar comprovante de pagamento"}
              </span>
              <span className="block text-xs text-[var(--gray-500)]">
                PDF ou imagem · obrigatório
              </span>
            </span>
            {proofName ? (
              <span
                className="max-w-full truncate rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--navy)]"
                title={proofName}
              >
                {proofName}
              </span>
            ) : null}
            <input
              name="proofFile"
              type="file"
              accept=".pdf,image/*"
              required
              className="sr-only"
              onChange={(e) => setProofName(e.target.files?.[0]?.name ?? "")}
            />
          </label>

          <label className="field">
            <span>Observações</span>
            <textarea name="notes" rows={2} placeholder="Opcional" />
          </label>

          <label className="field sm:max-w-xs">
            <span>Lembrar de anexar NF/RPA em</span>
            <input
              type="date"
              name="nfReminderAt"
              required
              defaultValue={defaultNfReminderAt}
            />
          </label>

          <ToggleSwitch
            boxed
            name="hasBond"
            label="Vínculo declarado com o projeto"
          />
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
          <p className="text-xs text-[var(--gray-500)]">
            Após registrar, o compromisso aparece como{" "}
            <span className="font-semibold text-emerald-700">Pago</span> com badge{" "}
            <span className="font-semibold text-red-600">NF pendente</span>.
          </p>
          <button type="submit" className="btn gap-2" disabled={!canSubmit}>
            {pending ? (
              "Registrando…"
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M20 6 9 17l-5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Registrar pagamento
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
