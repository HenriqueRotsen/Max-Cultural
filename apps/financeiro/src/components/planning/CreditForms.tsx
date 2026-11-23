"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { PronacOverrideField } from "@/components/planning/PronacOverrideField";
import {
  createPaymentCredit,
  deletePaymentCredit,
  undoPaymentCreditUse,
  applyPaymentCredit,
} from "@/lib/planning/credit-actions";
import type { ActionState } from "@/lib/planning/action-state";
import { formatCgccpfInput } from "@/lib/format";

const initial: ActionState = {};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-700">{state.message}</p>;
  return null;
}

/** Novo crédito: comprovante de um pagamento sem nota. */
export function CreditCreateForm({ planningProjectId }: { planningProjectId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createPaymentCredit.bind(null, planningProjectId),
    initial,
  );
  const [cnpj, setCnpj] = useState("");
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span>Fornecedor (quem recebeu)</span>
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
      <label className="field">
        <span>Comprovante de pagamento</span>
        <input name="proofFile" type="file" accept=".pdf,image/*" required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyInput name="amount" label="Valor pago (se o comprovante não mostrar)" />
        <label className="field">
          <span>Data do pagamento (se não aparecer)</span>
          <input type="date" name="paidAt" />
        </label>
      </div>
      <label className="field">
        <span>Observação (opcional)</span>
        <input name="notes" placeholder="Ex.: hospedagem da equipe, notas 103002 e 103003" />
      </label>
      {state.pronacOverride ? <PronacOverrideField allowed /> : null}
      <Feedback state={state} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Salvando…" : "Registrar crédito"}
      </button>
    </form>
  );
}

/** Pagar a nota desta reserva com um crédito do mesmo fornecedor. */
export function CreditUseForm({
  commitmentId,
  credits,
  nfLeft,
}: {
  commitmentId: string;
  credits: Array<{ id: string; label: string; remaining: number }>;
  nfLeft: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    applyPaymentCredit.bind(null, commitmentId),
    initial,
  );
  const [creditId, setCreditId] = useState(credits[0]?.id ?? "");
  const chosen = credits.find((c) => c.id === creditId);
  const suggested = Math.round(Math.min(chosen?.remaining ?? 0, nfLeft) * 100) / 100;
  const [amount, setAmount] = useState<number | null>(suggested);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      <label className="field">
        <span>Crédito</span>
        <select
          name="creditId"
          value={creditId}
          onChange={(e) => {
            setCreditId(e.target.value);
            const c = credits.find((x) => x.id === e.target.value);
            setAmount(Math.round(Math.min(c?.remaining ?? 0, nfLeft) * 100) / 100);
          }}
        >
          {credits.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · disponível {brl(c.remaining)}
            </option>
          ))}
        </select>
      </label>
      <MoneyInput name="amount" label="Quanto usar nesta nota" value={amount} onChange={setAmount} />
      <Feedback state={state} />
      <button type="submit" className="btn" disabled={pending || !creditId}>
        {pending ? "Usando…" : "Pagar com crédito"}
      </button>
    </form>
  );
}

function ConfirmButton({
  label,
  question,
  run,
}: {
  label: string;
  question: string;
  run: () => Promise<ActionState>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>({});
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
        disabled={pending}
        onClick={() => {
          if (!confirm(question)) return;
          start(async () => {
            const r = await run();
            setMsg(r);
            if (r.ok) router.refresh();
          });
        }}
      >
        {pending ? "…" : label}
      </button>
      {msg.error ? <span className="text-xs text-red-700">{msg.error}</span> : null}
    </span>
  );
}

export function CreditUseUndoButton({ useId, amount }: { useId: string; amount: number }) {
  return (
    <ConfirmButton
      label="Desfazer"
      question={`Desfazer este uso? ${brl(amount)} voltam para o crédito e a nota volta a aguardar pagamento.`}
      run={() => undoPaymentCreditUse(useId)}
    />
  );
}

export function CreditDeleteButton({ creditId }: { creditId: string }) {
  return (
    <ConfirmButton
      label="Excluir"
      question="Excluir este crédito? Ele ainda não foi usado por nenhuma nota."
      run={() => deletePaymentCredit(creditId)}
    />
  );
}
