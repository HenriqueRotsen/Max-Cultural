"use client";

import { useState, useTransition, type FormEvent } from "react";
import { PronacOverrideField } from "@/components/planning/PronacOverrideField";
import { useReimbursementPrompt } from "@/components/planning/ReimbursementPrompt";
import { RubricSearchSelect, type RubricSelectOption } from "@/components/planning/RubricSearchSelect";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { formatCgccpfInput, formatCurrency } from "@/lib/format";
import {
  createBoletoReservation,
  readBoletoForReservation,
  type BoletoReading,
} from "@/lib/planning/manual-commitment";
import type { ActionState } from "@/lib/planning/action-state";

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Reserva por boleto em duas etapas: 1) o sistema lê o boleto (valor e
 * vencimento pela linha digitável); 2) a pessoa confirma fornecedor e rubrica.
 * Valor e vencimento não são digitados: vêm do boleto.
 */
export function BoletoReservationForm({
  planningProjectId,
  lines,
}: {
  planningProjectId: string;
  lines: RubricSelectOption[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [typedLine, setTypedLine] = useState("");
  const [reading, setReading] = useState<BoletoReading | null>(null);
  const [state, setState] = useState<ActionState>({});
  const [lineId, setLineId] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [pending, start] = useTransition();
  const reimbursement = useReimbursementPrompt();

  const read = () => {
    if (!file) return;
    start(async () => {
      const fd = new FormData();
      fd.set("supportFile", file);
      if (typedLine) fd.set("boletoLine", typedLine);
      const r = await readBoletoForReservation(fd);
      setReading(r);
      setState({});
      if (r.ok && r.cnpjs?.[0] && !cnpj) setCnpj(formatCgccpfInput(r.cnpjs[0]));
    });
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    reimbursement.onSubmit(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (!file || !reading?.ok) return;
    const fd = new FormData(e.currentTarget);
    fd.set("supportFile", file);
    if (typedLine) fd.set("boletoLine", typedLine);
    fd.set("budgetLineId", lineId);
    fd.set("amount", String(reading.amount ?? 0).replace(".", ","));
    start(async () => {
      const r = await createBoletoReservation(planningProjectId, fd);
      if (r) setState(r);
    });
  };

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold text-[var(--navy)]">1. O boleto</h2>
        <label className="field">
          <span>PDF do boleto</span>
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReading(null);
            }}
          />
        </label>
        {reading && !reading.ok ? (
          <div className="space-y-2">
            <p className="text-sm text-red-700">{reading.error}</p>
            <label className="field">
              <span>Linha digitável (47 números)</span>
              <input value={typedLine} onChange={(e) => setTypedLine(e.target.value)} />
            </label>
          </div>
        ) : null}
        <button type="button" className="btn" disabled={!file || pending} onClick={read}>
          {pending && !reading ? "Lendo o boleto…" : "Ler boleto"}
        </button>
        {reading?.ok ? (
          <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm sm:grid-cols-3">
            <p>
              <span className="block text-xs text-[var(--gray-500)]">Valor</span>
              <strong>{formatCurrency(reading.amount ?? 0)}</strong>
            </p>
            <p>
              <span className="block text-xs text-[var(--gray-500)]">Vencimento</span>
              <strong>{reading.dueDate ? fmtDate(reading.dueDate) : "—"}</strong>
            </p>
            <p>
              <span className="block text-xs text-[var(--gray-500)]">CNPJ no boleto</span>
              <strong>{reading.cnpjs?.length ? reading.cnpjs.map(formatCgccpfInput).join(", ") : "não encontrado"}</strong>
            </p>
          </div>
        ) : null}
      </section>

      {reading?.ok ? (
        <form onSubmit={submit} className="card space-y-4 p-5">
          {reimbursement.field}
          <h2 className="font-semibold text-[var(--navy)]">2. Fornecedor e rubrica</h2>
          {state.error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.error}
            </p>
          ) : null}
          {state.pronacOverride ? <PronacOverrideField allowed /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span>Fornecedor (razão social)</span>
              <input name="supplierName" required defaultValue={reading.supplierName ?? ""} />
            </label>
            <label className="field">
              <span>CPF / CNPJ</span>
              <input
                name="cnpj"
                required
                value={cnpj}
                onChange={(e) => setCnpj(formatCgccpfInput(e.target.value))}
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="viaPlatform" className="mt-0.5" />
            <span>
              O boleto é emitido por uma plataforma de cobrança em nome do fornecedor
              <span className="block text-xs text-[var(--gray-500)]">
                Só marque se o CNPJ do boleto não for o do fornecedor por esse motivo. Fica registrado.
              </span>
            </span>
          </label>
          <div className="field">
            <span>Rubrica</span>
            <RubricSearchSelect value={lineId} options={lines} onChange={setLineId} />
          </div>
          <label className="field">
            <span>Observações</span>
            <textarea name="notes" rows={2} placeholder="Opcional" />
          </label>
          <ToggleSwitch
            boxed
            name="hasBond"
            label="Vínculo com o proponente"
            description="O fornecedor tem vínculo com o proponente nesta IN."
          />
          {reimbursement.control}
          <p className="text-sm text-[var(--gray-600)]">
            Reserva de <strong>{formatCurrency(reading.amount ?? 0)}</strong> com pagamento previsto
            para <strong>{reading.dueDate ? fmtDate(reading.dueDate) : "—"}</strong> (vencimento do
            boleto).
          </p>
          <button type="submit" className="btn" disabled={pending || !lineId}>
            {pending ? "Reservando…" : "Reservar pelo boleto"}
          </button>
        </form>
      ) : null}
      {reimbursement.dialog}
    </div>
  );
}
