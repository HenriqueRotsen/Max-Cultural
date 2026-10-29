"use client";

import { useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import {
  RubricSearchSelect,
  type RubricSelectOption,
} from "@/components/planning/RubricSearchSelect";

export type AllocRow = { budgetLineId: string; sharePct: string };

function parsePct(raw: string) {
  return Number(String(raw).replace(",", ".")) || 0;
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
        <p
          className={`text-xs tabular-nums ${
            Math.abs(shareSum - 100) <= 0.05
              ? "text-emerald-700"
              : "text-amber-800"
          }`}
        >
          Soma: {shareSum.toFixed(2)}%
        </p>
      </div>

      {hasDuplicateLines ? (
        <p className="text-xs text-red-700">
          Não é permitido ratear duas vezes na mesma rubrica.
        </p>
      ) : null}

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
                    onChange(next);
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

export function allocationsJsonFromRows(
  allocs: AllocRow[],
): string {
  return JSON.stringify(
    allocs
      .filter((a) => a.budgetLineId)
      .map((a) => ({
        budgetLineId: a.budgetLineId,
        sharePct: parsePct(a.sharePct),
      }))
      .filter((a) => a.sharePct > 0),
  );
}

export function parsePctValue(raw: string) {
  return parsePct(raw);
}
