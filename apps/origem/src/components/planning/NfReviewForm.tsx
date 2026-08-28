"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { confirmNfReservation, type ActionState } from "@/lib/planning/actions";
import type { ExtractedFiscalDoc } from "@/lib/nf/extract";
import { formatCgccpfInput, formatCurrency } from "@/lib/format";
import { formatCnaeInput } from "@/lib/catalog/cnae";
import { MoneyInput } from "@/components/MoneyInput";
import {
  RubricSearchSelect,
  type RubricSelectOption,
} from "@/components/planning/RubricSearchSelect";

const initial: ActionState = {};

type LineOpt = RubricSelectOption;

type AllocRow = { budgetLineId: string; sharePct: string };

function parsePct(raw: string) {
  return Number(String(raw).replace(",", ".")) || 0;
}

function ComplianceAlertDialog({
  open,
  messages,
  onClose,
}: {
  open: boolean;
  messages: string[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || messages.length === 0 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nf-compliance-alert-title"
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800"
            aria-hidden
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div>
            <h2
              id="nf-compliance-alert-title"
              className="text-base font-semibold text-amber-950"
            >
              Verifique o documento
            </h2>
            <p className="mt-0.5 text-xs text-amber-900/80">
              Possível inconsistência detectada na leitura do arquivo.
            </p>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          {messages.map((msg) => (
            <p key={msg} className="text-sm leading-relaxed text-[var(--navy)]">
              {msg}
            </p>
          ))}
        </div>
        <div className="flex justify-end border-t border-[var(--border)] px-5 py-3">
          <button type="button" className="btn" onClick={onClose}>
            Entendi, continuar revisão
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function NfReviewForm({
  documentId,
  extracted,
  lines,
  complianceWarning,
  documentKind,
  suggestedLineId,
  suggestionReasons,
  attachCommitmentId,
  attachAmount,
  initialAllocations,
  defaultExpectedPayAt,
  defaultPaymentReminderAt,
  taxDueHint,
  alertWarnings,
}: {
  documentId: string;
  extracted: ExtractedFiscalDoc;
  lines: LineOpt[];
  complianceWarning?: string | null;
  /** Avisos críticos (ex.: projeto divergente) — exibidos em popup. */
  alertWarnings?: string[];
  documentKind?: "NF" | "RPA";
  suggestedLineId?: string | null;
  suggestionReasons?: string[];
  /** Vincula NF a pagamento antecipado existente. */
  attachCommitmentId?: string | null;
  attachAmount?: number | null;
  /** Rateio do comprovante de pagamento antecipado. */
  initialAllocations?: Array<{
    budgetLineId: string;
    sharePct: number;
    amount?: number;
  }> | null;
  defaultExpectedPayAt?: string;
  defaultPaymentReminderAt?: string;
  taxDueHint?: string | null;
}) {
  const action = confirmNfReservation.bind(null, documentId);
  const [state, formAction, pending] = useActionState(action, initial);
  const alertMessages = useMemo(
    () => (alertWarnings ?? []).filter(Boolean),
    [alertWarnings],
  );
  const [alertOpen, setAlertOpen] = useState(() => alertMessages.length > 0);
  useEffect(() => {
    if (alertMessages.length > 0) setAlertOpen(true);
  }, [alertMessages]);
  const firstItem = extracted.items?.[0];
  const defaultGross =
    extracted.grossAmount ?? extracted.totalPrice ?? firstItem?.price ?? 0;
  const visibleLines = lines.filter((l) => l.available > 0 || l.isAdmin);
  const kind = documentKind || extracted.documentKind || "NF";
  const payment = extracted.payment;
  const taxes = extracted.taxes;

  const suggestedOk =
    Boolean(suggestedLineId) &&
    visibleLines.some((l) => l.id === suggestedLineId);
  const defaultLineId = suggestedOk
    ? suggestedLineId!
    : visibleLines[0]?.id || "";

  const [cnpj, setCnpj] = useState(() => formatCgccpfInput(extracted.cnpj || ""));
  const [cnaeCode, setCnaeCode] = useState(() =>
    formatCnaeInput(extracted.cnaeCode || ""),
  );
  const isCnpj = cnpj.replace(/\D/g, "").length === 14;
  const [grossAmount, setGrossAmount] = useState<number | null>(
    defaultGross > 0 ? Math.round(defaultGross * 100) / 100 : null,
  );
  const [allocs, setAllocs] = useState<AllocRow[]>(() => {
    if (initialAllocations?.length) {
      return initialAllocations.map((a) => ({
        budgetLineId: a.budgetLineId,
        sharePct: String(a.sharePct),
      }));
    }
    return [
      {
        budgetLineId: defaultLineId,
        sharePct: "100",
      },
    ];
  });

  const suggestedLine = visibleLines.find((l) => l.id === suggestedLineId);
  const usingSuggestion =
    Boolean(suggestedLineId) &&
    allocs.length === 1 &&
    allocs[0]?.budgetLineId === suggestedLineId;

  const gross = grossAmount ?? 0;

  const shareSum = useMemo(
    () => allocs.reduce((s, a) => s + parsePct(a.sharePct), 0),
    [allocs],
  );

  const usedLineIds = useMemo(
    () => new Set(allocs.map((a) => a.budgetLineId).filter(Boolean)),
    [allocs],
  );

  const hasDuplicateLines = useMemo(() => {
    const ids = allocs.map((a) => a.budgetLineId).filter(Boolean);
    return ids.length !== new Set(ids).size;
  }, [allocs]);

  const freeLinesLeft = visibleLines.some((l) => !usedLineIds.has(l.id));

  const allocationsJson = JSON.stringify(
    allocs
      .filter((a) => a.budgetLineId)
      .map((a) => ({
        budgetLineId: a.budgetLineId,
        sharePct: parsePct(a.sharePct),
      })),
  );

  const canSubmit =
    !pending &&
    visibleLines.length > 0 &&
    gross > 0 &&
    Math.abs(shareSum - 100) <= 0.05 &&
    !hasDuplicateLines &&
    allocs.every((a) => a.budgetLineId);

  return (
    <>
      <ComplianceAlertDialog
        open={alertOpen}
        messages={alertMessages}
        onClose={() => setAlertOpen(false)}
      />
      <form action={formAction} className="card space-y-4 p-5">
      <input type="hidden" name="allocationsJson" value={allocationsJson} />
      {attachCommitmentId ? (
        <input
          type="hidden"
          name="attachCommitmentId"
          value={attachCommitmentId}
        />
      ) : null}
      {attachCommitmentId ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Vinculando NF ao pagamento antecipado
          {attachAmount != null
            ? ` de ${formatCurrency(attachAmount)}`
            : ""}
          .
          {initialAllocations && initialAllocations.length > 1
            ? ` Mantenha o mesmo rateio em ${initialAllocations.length} rubricas.`
            : " O rateio será fixado na rubrica do compromisso."}
        </p>
      ) : null}
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {complianceWarning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {complianceWarning}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span>{isCnpj ? "CNPJ" : "CPF / CNPJ"}</span>
          <input
            name="cnpj"
            required
            inputMode="numeric"
            autoComplete="off"
            placeholder={isCnpj ? "00.000.000/0000-00" : "000.000.000-00"}
            value={cnpj}
            onChange={(e) => setCnpj(formatCgccpfInput(e.target.value))}
            className="w-full tabular-nums"
          />
        </label>
        <label className="field">
          <span>Fornecedor / Prestador</span>
          <input
            name="supplierName"
            required
            defaultValue={extracted.supplierName || ""}
            className="w-full"
          />
        </label>
        {isCnpj ? (
          <>
            <label className="field">
              <span>CNAE</span>
              <input
                name="cnaeCode"
                required
                inputMode="numeric"
                autoComplete="off"
                placeholder="0000-0/00"
                value={cnaeCode}
                onChange={(e) => setCnaeCode(formatCnaeInput(e.target.value))}
                className="w-full tabular-nums"
              />
            </label>
            <label className="field">
              <span>Descrição do CNAE</span>
              <input
                name="cnaeDescription"
                defaultValue={extracted.cnaeDescription || ""}
                className="w-full"
              />
            </label>
          </>
        ) : null}
        <label className="field sm:col-span-2">
          <span>Serviço / descrição</span>
          <input
            name="serviceName"
            required
            defaultValue={extracted.serviceDescription || firstItem?.name || ""}
            className="w-full"
          />
        </label>
        <MoneyInput
          name="grossAmount"
          label="Valor bruto"
          required
          value={grossAmount}
          onChange={setGrossAmount}
        />
        <label className="field">
          <span>Data</span>
          <input
            name="hiredAt"
            type="date"
            defaultValue={extracted.hiredAt || ""}
            className="!h-11 w-full"
          />
        </label>
      </div>

      <div className="border-t border-[var(--gray-200)] pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
          Impostos
        </p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(
            [
              ["taxIss", "ISS", taxes?.iss],
              ["taxIrrf", "IRRF", taxes?.irrf],
              ["taxInss", "INSS", taxes?.inss],
              ["taxCsll", "CSLL", taxes?.csll],
              ["taxPis", "PIS", taxes?.pis],
              ["taxCofins", "COFINS", taxes?.cofins],
              ["taxOther", "Outros", taxes?.other],
            ] as const
          ).map(([name, label, val]) => (
            <MoneyInput
              key={name}
              name={name}
              label={label}
              defaultValue={val ?? null}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--gray-200)] pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
            Rateio por rubrica
          </p>
          <p
            className={`text-sm tabular-nums ${
              Math.abs(shareSum - 100) < 0.05
                ? "text-emerald-700"
                : "text-amber-800"
            }`}
          >
            Soma {shareSum.toFixed(2)}%
            {gross > 0 ? ` · ${formatCurrency(gross)}` : ""}
          </p>
        </div>
        {hasDuplicateLines ? (
          <p className="mb-2 text-sm text-red-700">
            Não é permitido ratear duas vezes na mesma rubrica.
          </p>
        ) : null}
        {suggestedLine ? (
          <div
            className={`mb-3 rounded-xl border px-3 py-2.5 text-sm ${
              usingSuggestion
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-[var(--border)] bg-[var(--gray-50)] text-[var(--navy)]"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  {usingSuggestion ? "Rubrica sugerida em uso" : "Sugestão de rubrica"}
                </p>
                <p className="mt-0.5 font-semibold">
                  {suggestedLine.itemName}
                  {suggestedLine.stageName
                    ? ` · ${suggestedLine.stageName}`
                    : ""}
                </p>
                {suggestionReasons && suggestionReasons.length > 0 ? (
                  <p className="mt-1 text-xs opacity-80">
                    {suggestionReasons.join(" · ")}
                  </p>
                ) : null}
              </div>
              {!usingSuggestion ? (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 text-xs"
                  onClick={() =>
                    setAllocs([{ budgetLineId: suggestedLine.id, sharePct: "100" }])
                  }
                >
                  Usar sugestão
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="space-y-3">
          {allocs.map((row, idx) => {
            const line = visibleLines.find((l) => l.id === row.budgetLineId);
            const pct = parsePct(row.sharePct);
            const allocated =
              gross > 0 && pct > 0
                ? Math.round(((gross * pct) / 100) * 100) / 100
                : 0;
            const saldoAfter =
              line != null ? Math.round((line.available - allocated) * 100) / 100 : null;
            const overDisponivel =
              line != null && allocated > line.available + 0.009;
            const options = visibleLines.filter(
              (l) => l.id === row.budgetLineId || !usedLineIds.has(l.id),
            );

            return (
              <div
                key={idx}
                className="space-y-2 rounded-lg border border-[var(--border)] p-3"
              >
                <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_auto]">
                  <div className="field min-w-0">
                    <span>Rubrica</span>
                    <RubricSearchSelect
                      value={row.budgetLineId}
                      options={options}
                      onChange={(id) => {
                        const next = [...allocs];
                        next[idx] = { ...row, budgetLineId: id };
                        setAllocs(next);
                      }}
                    />
                  </div>
                  <label className="field">
                    <span>%</span>
                    <input
                      className="!h-11 w-full"
                      inputMode="decimal"
                      value={row.sharePct}
                      onChange={(e) => {
                        const next = [...allocs];
                        next[idx] = { ...row, sharePct: e.target.value };
                        setAllocs(next);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost h-11 shrink-0 px-3"
                    disabled={allocs.length <= 1}
                    onClick={() =>
                      setAllocs(allocs.filter((_, i) => i !== idx))
                    }
                  >
                    Remover
                  </button>
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-md bg-[var(--gray-50)] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--gray-400)]">
                      Valor alocado
                    </p>
                    <p className="mt-0.5 font-semibold tabular-nums text-[var(--navy)]">
                      {formatCurrency(allocated)}
                    </p>
                  </div>
                  <div className="rounded-md bg-[var(--gray-50)] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--gray-400)]">
                      Disponível atual
                    </p>
                    <p className="mt-0.5 font-semibold tabular-nums text-[var(--navy)]">
                      {line ? formatCurrency(line.available) : "—"}
                    </p>
                  </div>
                  <div
                    className={`rounded-md px-3 py-2 ${
                      overDisponivel
                        ? "bg-red-50"
                        : "bg-[var(--gray-50)]"
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-[var(--gray-400)]">
                      Saldo após reserva
                    </p>
                    <p
                      className={`mt-0.5 font-semibold tabular-nums ${
                        overDisponivel
                          ? "text-red-800"
                          : "text-[var(--navy)]"
                      }`}
                    >
                      {saldoAfter != null ? formatCurrency(saldoAfter) : "—"}
                    </p>
                  </div>
                </div>
                {overDisponivel ? (
                  <p className="text-xs text-red-700">
                    O valor alocado ultrapassa o disponível desta rubrica
                    {line?.isAdmin ? " (Administração não pode exceder)." : "."}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn-ghost mt-2"
          disabled={!freeLinesLeft}
          onClick={() => {
            const nextId =
              visibleLines.find((l) => !usedLineIds.has(l.id))?.id || "";
            const remaining = Math.max(0, Math.round((100 - shareSum) * 100) / 100);
            setAllocs([
              ...allocs,
              {
                budgetLineId: nextId,
                sharePct: remaining > 0 ? String(remaining) : "",
              },
            ]);
          }}
        >
          {freeLinesLeft ? "+ Rubrica" : "Todas as rubricas já estão no rateio"}
        </button>
      </div>

      <div className="border-t border-[var(--gray-200)] pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
          Pagamento e lembretes
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">
            <span>Pagamento até (5º dia útil)</span>
            <input
              type="date"
              readOnly
              className="bg-[var(--gray-50)]"
              value={defaultExpectedPayAt || ""}
              title="Prazo legal calculado a partir da data de contratação/emissão"
            />
          </label>
          {!attachCommitmentId ? (
            <label className="field">
              <span>Lembrar pagamento em</span>
              <input
                type="date"
                name="paymentReminderAt"
                required
                defaultValue={defaultPaymentReminderAt || ""}
              />
            </label>
          ) : null}
        </div>
        {taxDueHint ? (
          <p className="mt-2 text-xs text-[var(--gray-500)]">{taxDueHint}</p>
        ) : null}
      </div>

      <div className="border-t border-[var(--gray-200)] pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
          Dados de pagamento
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            <span>Chave PIX</span>
            <input name="pixKey" defaultValue={payment?.pixKey || ""} className="w-full" />
          </label>
          <label className="field">
            <span>Banco</span>
            <input name="bankName" defaultValue={payment?.bankName || ""} className="w-full" />
          </label>
          <label className="field">
            <span>Agência</span>
            <input name="bankAgency" defaultValue={payment?.bankAgency || ""} className="w-full" />
          </label>
          <label className="field">
            <span>Conta</span>
            <input name="bankAccount" defaultValue={payment?.bankAccount || ""} className="w-full" />
          </label>
          <label className="field sm:col-span-2">
            <span>Observações de pagamento</span>
            <textarea
              name="paymentNotes"
              rows={2}
              defaultValue={payment?.paymentNotes || ""}
              className="w-full"
            />
          </label>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="hasBond" className="mt-1" />
        <span>
          Este fornecedor tem vínculo com o proponente nesta IN (conta no teto do
          proponente / Observado).
        </span>
      </label>

      <button type="submit" className="btn" disabled={!canSubmit}>
        {pending ? "Reservando…" : `Confirmar ${kind} e reservar`}
      </button>
    </form>
    </>
  );
}
