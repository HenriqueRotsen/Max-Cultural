"use client";

import { useActionState, useMemo, useState } from "react";
import { createPedido } from "@/lib/planning/pedido";
import type { ActionState } from "@/lib/planning/action-state";
import { formatCgccpfInput, formatCurrency } from "@/lib/format";
import { MoneyInput } from "@/components/MoneyInput";
import {
  RubricSearchSelect,
  type RubricSelectOption,
} from "@/components/planning/RubricSearchSelect";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  INSTALLMENT_COUNT_MAX,
  INSTALLMENT_COUNT_MIN,
  splitInstallments,
} from "@/lib/planning/installments";

const initial: ActionState = {};

type ParcelDraft = {
  key: string;
  budgetLineId: string;
  amount: number | null;
  expectedPayAt: string;
};

function newParcel(
  defaultLineId: string,
  overrides?: Partial<Pick<ParcelDraft, "amount" | "expectedPayAt" | "budgetLineId">>,
): ParcelDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    budgetLineId: overrides?.budgetLineId ?? defaultLineId,
    amount: overrides?.amount ?? null,
    expectedPayAt: overrides?.expectedPayAt ?? "",
  };
}

export function PedidoForm({
  planningProjectId,
  lines,
}: {
  planningProjectId: string;
  lines: RubricSelectOption[];
}) {
  const action = createPedido.bind(null, planningProjectId);
  const [state, formAction, pending] = useActionState(action, initial);
  const defaultLineId = lines[0]?.id || "";
  const [cnpj, setCnpj] = useState("");
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [parcels, setParcels] = useState<ParcelDraft[]>([
    newParcel(defaultLineId),
  ]);
  const [hasBond, setHasBond] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(12);
  const [firstPayAt, setFirstPayAt] = useState("");
  const [splitLineId, setSplitLineId] = useState(defaultLineId);
  const [splitError, setSplitError] = useState<string | null>(null);

  const parcelsSum = useMemo(
    () =>
      Math.round(
        parcels.reduce((s, p) => s + (p.amount || 0), 0) * 100,
      ) / 100,
    [parcels],
  );

  const parcelsJson = useMemo(
    () =>
      JSON.stringify(
        parcels.map((p) => ({
          budgetLineId: p.budgetLineId,
          amount: p.amount || 0,
          expectedPayAt: p.expectedPayAt,
        })),
      ),
    [parcels],
  );

  const totalMismatch =
    totalAmount != null &&
    totalAmount > 0 &&
    Math.abs(parcelsSum - totalAmount) > 0.02;

  function generateInstallments() {
    setSplitError(null);
    if (totalAmount == null || !(totalAmount > 0)) {
      setSplitError("Informe o valor total antes de gerar as parcelas.");
      return;
    }
    if (!firstPayAt) {
      setSplitError("Informe a data da 1ª parcela.");
      return;
    }
    const lineId = splitLineId || defaultLineId;
    if (!lineId) {
      setSplitError("Selecione a rubrica das parcelas.");
      return;
    }
    try {
      const parts = splitInstallments(
        totalAmount,
        installmentCount,
        firstPayAt,
      );
      setParcels(
        parts.map((p) =>
          newParcel(lineId, {
            amount: p.amount,
            expectedPayAt: p.expectedPayAt,
            budgetLineId: lineId,
          }),
        ),
      );
    } catch (e) {
      setSplitError(e instanceof Error ? e.message : "Não foi possível gerar.");
    }
  }

  return (
    <form action={formAction} className="card space-y-4 p-5">
      <input type="hidden" name="parcelsJson" value={parcelsJson} />
      <input type="hidden" name="hasBond" value={hasBond ? "true" : "false"} />

      <div>
        <h2 className="font-semibold text-[var(--navy)]">Novo pedido</h2>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          Reserva o valor nas rubricas sem precisar da NF — inclusive em N×.
          Cada parcela entra no contas a pagar com o vencimento previsto.
        </p>
      </div>

      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span>Fornecedor</span>
          <input name="supplierName" required />
        </label>
        <label className="field">
          <span>CPF/CNPJ</span>
          <input
            name="cnpj"
            value={cnpj}
            onChange={(e) => setCnpj(formatCgccpfInput(e.target.value))}
            required
          />
        </label>
      </div>

      <label className="field">
        <span>Descrição / serviço</span>
        <input name="description" placeholder="Opcional" />
      </label>

      <label className="field">
        <span>Valor total (R$)</span>
        <MoneyInput
          name="totalAmount"
          value={totalAmount}
          onChange={setTotalAmount}
          required
        />
      </label>

      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--gray-50)] p-3">
        <h3 className="text-sm font-semibold text-[var(--navy)]">
          Parcelar em N×
        </h3>
        <p className="text-xs text-[var(--gray-500)]">
          Gera parcelas iguais mês a mês. Depois você pode ajustar valor, data
          ou rubrica de cada uma.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="field">
            <span>Parcelas</span>
            <input
              type="number"
              min={INSTALLMENT_COUNT_MIN}
              max={INSTALLMENT_COUNT_MAX}
              value={installmentCount}
              onChange={(e) =>
                setInstallmentCount(
                  Math.min(
                    INSTALLMENT_COUNT_MAX,
                    Math.max(
                      INSTALLMENT_COUNT_MIN,
                      Number(e.target.value) || INSTALLMENT_COUNT_MIN,
                    ),
                  ),
                )
              }
            />
          </label>
          <label className="field">
            <span>1ª parcela</span>
            <input
              type="date"
              value={firstPayAt}
              onChange={(e) => setFirstPayAt(e.target.value)}
            />
          </label>
          <label className="field sm:col-span-1">
            <span>Rubrica padrão</span>
            <RubricSearchSelect
              value={splitLineId}
              options={lines}
              onChange={setSplitLineId}
            />
          </label>
        </div>
        {splitError ? (
          <p className="text-sm text-red-700">{splitError}</p>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={generateInstallments}
        >
          Gerar {installmentCount} parcelas
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--navy)]">Parcelas</h3>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() =>
              setParcels((prev) => [...prev, newParcel(defaultLineId)])
            }
          >
            + Parcela
          </button>
        </div>

        {parcels.map((parcel, index) => (
          <div
            key={parcel.key}
            className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--gray-50)] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-500)]">
                Parcela {index + 1}
              </p>
              {parcels.length > 1 ? (
                <button
                  type="button"
                  className="text-xs font-medium text-red-700"
                  onClick={() =>
                    setParcels((prev) => prev.filter((p) => p.key !== parcel.key))
                  }
                >
                  Remover
                </button>
              ) : null}
            </div>
            <label className="field">
              <span>Rubrica / ação</span>
              <RubricSearchSelect
                value={parcel.budgetLineId}
                options={lines}
                onChange={(id) =>
                  setParcels((prev) =>
                    prev.map((p) =>
                      p.key === parcel.key ? { ...p, budgetLineId: id } : p,
                    ),
                  )
                }
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">
                <span>Valor (R$)</span>
                <MoneyInput
                  value={parcel.amount}
                  onChange={(v) =>
                    setParcels((prev) =>
                      prev.map((p) =>
                        p.key === parcel.key ? { ...p, amount: v } : p,
                      ),
                    )
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Pagamento previsto</span>
                <input
                  type="date"
                  value={parcel.expectedPayAt}
                  onChange={(e) =>
                    setParcels((prev) =>
                      prev.map((p) =>
                        p.key === parcel.key
                          ? { ...p, expectedPayAt: e.target.value }
                          : p,
                      ),
                    )
                  }
                />
              </label>
            </div>
          </div>
        ))}

        <p
          className={`text-sm ${
            totalMismatch ? "text-red-700" : "text-[var(--gray-500)]"
          }`}
        >
          Soma das parcelas: {formatCurrency(parcelsSum)}
          {totalAmount != null ? ` · total ${formatCurrency(totalAmount)}` : ""}
          {totalMismatch ? " — valores divergentes" : ""}
        </p>
      </div>

      <ToggleSwitch
        checked={hasBond}
        onCheckedChange={setHasBond}
        label="Possui vínculo com o proponente"
      />

      <button
        type="submit"
        className="btn"
        disabled={pending || totalMismatch || !totalAmount}
      >
        {pending ? "Criando…" : "Criar pedido e reservar"}
      </button>
    </form>
  );
}
