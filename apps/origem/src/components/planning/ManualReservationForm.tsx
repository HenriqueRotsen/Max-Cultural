"use client";

import { useActionState, useState } from "react";
import {
  createManualReservation,
} from "@/lib/planning/manual-commitment";
import type { ActionState } from "@/lib/planning/action-state";
import { formatCgccpfInput } from "@/lib/format";
import { MoneyInput } from "@/components/MoneyInput";
import {
  RubricSearchSelect,
  type RubricSelectOption,
} from "@/components/planning/RubricSearchSelect";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";

const initial: ActionState = {};

export function ManualReservationForm({
  planningProjectId,
  lines,
}: {
  planningProjectId: string;
  lines: RubricSelectOption[];
}) {
  const action = createManualReservation.bind(null, planningProjectId);
  const [state, formAction, pending] = useActionState(action, initial);
  const [budgetLineId, setBudgetLineId] = useState(lines[0]?.id || "");
  const [amount, setAmount] = useState<number | null>(null);
  const [cnpj, setCnpj] = useState("");

  return (
    <form action={formAction} className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold text-[var(--navy)]">Reserva manual (sem NF)</h2>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          Bloqueia saldo na rubrica antes de receber a nota fiscal.
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-red-700">{state.error}</p>
      ) : null}

      <input type="hidden" name="budgetLineId" value={budgetLineId} />

      <label className="field">
        <span>Rubrica</span>
        <RubricSearchSelect
          value={budgetLineId}
          options={lines}
          onChange={setBudgetLineId}
        />
      </label>

      <label className="field">
        <span>Valor (R$)</span>
        <MoneyInput name="amount" value={amount} onChange={setAmount} required />
      </label>

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

      <label className="field">
        <span>Descrição do serviço</span>
        <input name="serviceName" placeholder="Opcional — usa o nome do fornecedor" />
      </label>

      <label className="field">
        <span>Data prevista de pagamento</span>
        <input name="expectedPayAt" type="date" />
      </label>

      <label className="field">
        <span>Observações</span>
        <textarea name="notes" rows={2} />
      </label>

      <ToggleSwitch
        boxed
        name="hasBond"
        label="Vínculo declarado com o projeto"
        description="Marque se o fornecedor tem vínculo com o proponente nesta IN."
      />

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Reservando…" : "Criar reserva"}
      </button>
    </form>
  );
}
