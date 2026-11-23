"use client";

import { useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import { MoneyInput } from "@/components/MoneyInput";
import {
  RubricSearchSelect,
  type RubricSelectOption,
} from "@/components/planning/RubricSearchSelect";

/** `amount`: valor em reais digitado (quando a pessoa rateia por valor, não por %). */
export type AllocRow = { budgetLineId: string; sharePct: string; amount?: string };

function parsePct(raw: string) {
  return Number(String(raw).replace(",", ".")) || 0;
}

/** "1.234,56" ou "1234.56" → número. */
export function parseBrlInput(raw: string | undefined): number {
  const s = String(raw ?? "").trim().replace(/[^\d.,]/g, "");
  if (!s) return 0;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;
}

/** Valor da linha: o digitado ou o calculado pela %. */
export function rowAmount(row: AllocRow, gross: number): number {
  if (row.amount != null) return Math.round(parseBrlInput(row.amount) * 100) / 100;
  const pct = parsePct(row.sharePct);
  return gross > 0 && pct > 0 ? Math.round(((gross * pct) / 100) * 100) / 100 : 0;
}

/** Digitou o valor em reais: guarda e recalcula a %. */
export function withAmount(row: AllocRow, text: string, gross: number): AllocRow {
  const v = parseBrlInput(text);
  return {
    ...row,
    amount: text,
    sharePct: gross > 0 && v > 0 ? String(Math.round((v / gross) * 100 * 10000) / 10000) : row.sharePct,
  };
}

/** Digitou a %: o valor volta a ser calculado. */
export function withPct(row: AllocRow, text: string): AllocRow {
  return { budgetLineId: row.budgetLineId, sharePct: text };
}

/** Campo "Valor (R$)" da linha do rateio (mesmo campo de dinheiro do total). */
export function AllocationAmountInput({
  row,
  gross,
  onChange,
}: {
  row: AllocRow;
  gross: number;
  onChange: (next: AllocRow) => void;
}) {
  const current = rowAmount(row, gross);
  return (
    <MoneyInput
      label="Valor"
      ariaLabel="Valor da rubrica"
      value={current > 0 ? current : null}
      onChange={(n) => onChange(withAmount(row, n != null ? String(n) : "", gross))}
    />
  );
}

/** Soma do rateio em reais × total, para o cabeçalho. */
export function AllocationSum({ allocs, gross }: { allocs: AllocRow[]; gross: number }) {
  const sum = Math.round(allocs.reduce((s, a) => s + rowAmount(a, gross), 0) * 100) / 100;
  const diff = Math.round((gross - sum) * 100) / 100;
  const ok = Math.abs(diff) <= 0.01;
  return (
    <p className={`text-xs tabular-nums ${ok ? "text-emerald-700" : "text-amber-800"}`}>
      Soma: {formatCurrency(sum)} de {formatCurrency(gross)}
      {ok ? "" : diff > 0 ? ` · faltam ${formatCurrency(diff)}` : ` · passou ${formatCurrency(-diff)}`}
    </p>
  );
}

/** Rateio fecha com o total (em reais, quando digitado; senão em %). */
export function allocationsClose(allocs: AllocRow[], gross: number): boolean {
  if (allocs.length > 0 && allocs.every((a) => a.amount != null)) {
    const sum = allocs.reduce((s, a) => s + rowAmount(a, gross), 0);
    return Math.abs(sum - gross) <= 0.01;
  }
  return Math.abs(allocs.reduce((s, a) => s + parsePct(a.sharePct), 0) - 100) <= 0.05;
}

export function RubricAllocationFields({
  lines,
  gross,
  allocs,
  onChange,
}: {
  lines: RubricSelectOption[];
  gross: number;
  allocs: AllocRow[];
  onChange: (next: AllocRow[]) => void;
}) {
  const visibleLines = lines.filter((l) => l.available > 0 || l.isAdmin);

  const shareSum = useMemo(
    () => allocs.reduce((s, a) => s + parsePct(a.sharePct), 0),
    [allocs],
  );

  const usedLineIds = useMemo(
    () => new Set(allocs.map((a) => a.budgetLineId).filter(Boolean)),
    [allocs],
  );

  const freeLinesLeft = visibleLines.some((l) => !usedLineIds.has(l.id));
  const hasDuplicateLines = useMemo(() => {
    const ids = allocs.map((a) => a.budgetLineId).filter(Boolean);
    return ids.length !== new Set(ids).size;
  }, [allocs]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--navy)]">Rateio por rubrica</p>
        <AllocationSum allocs={allocs} gross={gross} />
      </div>

      {hasDuplicateLines ? (
        <p className="text-xs text-red-700">
          Não é permitido ratear duas vezes na mesma rubrica.
        </p>
      ) : null}

      {allocs.map((row, idx) => {
        const line = visibleLines.find((l) => l.id === row.budgetLineId);
        const allocated = rowAmount(row, gross);
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
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem_auto]">
              <div className="field min-w-0">
                <span>Rubrica</span>
                <RubricSearchSelect
                  value={row.budgetLineId}
                  options={options}
                  onChange={(id) => {
                    const next = [...allocs];
                    next[idx] = { ...row, budgetLineId: id };
                    onChange(next);
                  }}
                />
              </div>
              <AllocationAmountInput
                row={row}
                gross={gross}
                onChange={(r) => {
                  const next = [...allocs];
                  next[idx] = r;
                  onChange(next);
                }}
              />
              <label className="field">
                <span>%</span>
                <input
                  className="!h-11 w-full"
                  inputMode="decimal"
                  value={row.amount != null ? (parsePct(row.sharePct) ? parsePct(row.sharePct).toFixed(2) : "") : row.sharePct}
                  onChange={(e) => {
                    const next = [...allocs];
                    next[idx] = withPct(row, e.target.value);
                    onChange(next);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost h-11 shrink-0 px-3"
                disabled={allocs.length <= 1}
                onClick={() => onChange(allocs.filter((_, i) => i !== idx))}
              >
                Remover
              </button>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2">
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
                  overDisponivel ? "bg-red-50" : "bg-[var(--gray-50)]"
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide text-[var(--gray-400)]">
                  Saldo após
                </p>
                <p
                  className={`mt-0.5 font-semibold tabular-nums ${
                    overDisponivel ? "text-red-800" : "text-[var(--navy)]"
                  }`}
                >
                  {saldoAfter != null ? formatCurrency(saldoAfter) : "—"}
                </p>
              </div>
            </div>
            {overDisponivel ? (
              <p className="text-xs text-red-700">
                Valor alocado ultrapassa o disponível desta rubrica
                {line?.isAdmin ? " (Administração não pode exceder)." : "."}
              </p>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        className="btn btn-ghost"
        disabled={!freeLinesLeft}
        onClick={() => {
          const nextId =
            visibleLines.find((l) => !usedLineIds.has(l.id))?.id || "";
          const remaining = Math.max(0, Math.round((100 - shareSum) * 100) / 100);
          onChange([
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
  );
}

/**
 * Rateio para o servidor. Com valor em reais digitado em todas as linhas, vai
 * o valor (o servidor usa como está); senão, só a %.
 */
export function allocationsJsonFromRows(allocs: AllocRow[], gross = 0): string {
  const rows = allocs.filter((a) => a.budgetLineId);
  const byAmount = rows.length > 0 && rows.every((a) => a.amount != null);
  return JSON.stringify(
    rows
      .map((a) => ({
        budgetLineId: a.budgetLineId,
        sharePct: parsePct(a.sharePct),
        ...(byAmount ? { amount: rowAmount(a, gross) } : {}),
      }))
      .filter((a) => a.sharePct > 0 || ("amount" in a && (a.amount ?? 0) > 0)),
  );
}

export function parsePctValue(raw: string) {
  return parsePct(raw);
}
