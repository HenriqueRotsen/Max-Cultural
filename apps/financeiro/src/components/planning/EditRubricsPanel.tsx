"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { MoneyInput } from "@/components/MoneyInput";
import { saveRubricReallocation } from "@/lib/planning/actions";
import { formatRubricShortLabel } from "@/lib/planning/rubric-label";
import { autoBalance } from "@/lib/planning/reallocation";

export type EditableRubricLine = {
  id: string;
  sortOrder: number;
  itemName: string;
  stageName: string;
  productName: string;
  city: string;
  state: string;
  homologatedAmount: number;
  approvedAmount: number;
  reserved: number;
  isAdmin?: boolean;
  locked?: boolean;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function EditRubricsPanel({
  planningProjectId,
  totalApproved,
  lines,
  menuItem = false,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  rubricOverrunPct = 100,
  triggerClassName,
}: {
  planningProjectId: string;
  totalApproved: number;
  lines: EditableRubricLine[];
  menuItem?: boolean;
  /** Modo controlado — modal permanece montado fora do menu. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  /** Excesso permitido na rubrica (limite do projeto), em %. */
  rubricOverrunPct?: number;
  /** Classe do botão que abre o editor (padrão: botão principal). */
  triggerClassName?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const editing = controlledOpen ?? internalOpen;
  const setEditing = onOpenChange ?? setInternalOpen;

  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, round2(l.approvedAmount)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!editing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [editing]);

  const sum = useMemo(
    () => round2(Object.values(values).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)),
    [values],
  );
  const target = round2(totalApproved);
  const diff = round2(sum - target);
  // Nenhuma rubrica pode ficar abaixo do que já foi reservado/pago.
  const belowUsed = lines.filter(
    (l) => !l.locked && (values[l.id] ?? l.approvedAmount) < round2(l.reserved) - 0.005,
  ).length;
  const boundsOf = (line: EditableRubricLine) => ({
    max: line.isAdmin
      ? round2(line.approvedAmount)
      : round2(line.homologatedAmount * (1 + rubricOverrunPct / 100)),
    min: round2(line.reserved),
  });
  // Valor digitado acima do máximo (homologado + excesso permitido).
  const aboveMax = lines.filter(
    (l) => !l.locked && !l.isAdmin && (values[l.id] ?? l.approvedAmount) > boundsOf(l).max + 0.005,
  ).length;
  const canSave = Math.abs(diff) < 0.005 && belowUsed === 0 && aboveMax === 0;

  // Rubricas com reservado/pago acima do aprovado: precisam de readequação.
  // Some quando o novo valor já cobre o usado.
  const overUsed = lines.filter(
    (l) =>
      !l.locked &&
      !l.isAdmin &&
      round2(l.reserved) > round2(values[l.id] ?? l.approvedAmount) + 0.005,
  );

  function raiseOverUsed() {
    setHint(null);
    setValues((prev) => {
      const next = { ...prev };
      for (const l of overUsed) {
        const { max, min } = boundsOf(l);
        next[l.id] = Math.min(max, Math.max(next[l.id] ?? 0, min));
      }
      return next;
    });
  }

  function autoAdjust() {
    const result = autoBalance(
      lines.map((l) => {
        const { max, min } = boundsOf(l);
        const value = values[l.id] ?? l.approvedAmount;
        return {
          id: l.id,
          value,
          min,
          max,
          fixed: Boolean(l.isAdmin || l.locked),
          edited: Math.abs(value - round2(l.approvedAmount)) > 0.005,
        };
      }),
      target,
    );
    setValues(result.values);
    setHint(
      result.remaining === 0
        ? "Ajustado: a diferença saiu das rubricas com mais saldo livre. Confira antes de salvar."
        : `Não há saldo livre suficiente nas outras rubricas: ainda faltam ${formatCurrency(Math.abs(result.remaining))}.`,
    );
  }

  // Guarda o que foi digitado; fora dos limites aparece em vermelho e trava o salvar.
  function setLineValue(id: string, raw: number | null) {
    setValues((prev) => ({ ...prev, [id]: round2(raw ?? 0) }));
  }

  function startEdit() {
    setValues(Object.fromEntries(lines.map((l) => [l.id, round2(l.approvedAmount)])));
    setError(null);
    setHint(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function save() {
    setError(null);
    start(async () => {
      const result = await saveRubricReallocation(planningProjectId, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  // Agrupa como na planilha: produto · etapa, na ordem das rubricas.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; productName: string; stageName: string; lines: EditableRubricLine[] }
    >();
    for (const l of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const key = `${l.productName}|${l.stageName}`;
      const g = map.get(key) ?? { key, productName: l.productName, stageName: l.stageName, lines: [] };
      g.lines.push(l);
      map.set(key, g);
    }
    return [...map.values()];
  }, [lines]);

  const editor = editing ? (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-rubrics-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="card flex max-h-[min(90vh,52rem)] w-full max-w-3xl flex-col overflow-hidden shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--navy-soft)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="edit-rubrics-title" className="text-lg font-semibold text-[var(--navy)]">
              Editar rubricas
            </h2>
            <p className="mt-1 text-sm text-[var(--gray-600)]">
              Ajuste valores por linha. A soma deve fechar em{" "}
              <strong className="tabular-nums">{formatCurrency(target)}</strong>.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--navy)] shadow-sm transition hover:border-[var(--navy)] hover:bg-[var(--gray-50)]"
            onClick={cancel}
            disabled={pending}
            aria-label="Fechar editor de rubricas"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Voltar
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="sticky -top-5 z-10 -mx-5 -mt-5 grid grid-cols-3 gap-3 border-b border-[var(--border)] bg-white px-5 py-3 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-500)]">
                Soma das rubricas
              </p>
              <p className="font-semibold tabular-nums text-[var(--navy)]">{formatCurrency(sum)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-500)]">
                Tem que fechar em
              </p>
              <p className="font-semibold tabular-nums text-[var(--navy)]">{formatCurrency(target)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-500)]">
                Situação
              </p>
              <p
                className={`font-semibold tabular-nums ${canSave ? "text-emerald-700" : "text-amber-700"}`}
              >
                {canSave
                  ? "Pode salvar"
                  : belowUsed > 0
                    ? `${belowUsed} abaixo do já usado`
                    : aboveMax > 0
                      ? `${aboveMax} acima do máximo`
                      : `${diff > 0 ? "Sobram" : "Faltam"} ${formatCurrency(Math.abs(diff))}`}
              </p>
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {overUsed.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">
                {overUsed.length} rubrica(s) com valor usado acima do aprovado: precisam de readequação.
              </p>
              <ul className="space-y-0.5 text-xs">
                {overUsed.map((l) => (
                  <li key={l.id}>
                    {formatRubricShortLabel(l)}: aprovado {formatCurrency(l.approvedAmount)} · usado{" "}
                    {formatCurrency(l.reserved)}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-ghost text-xs" onClick={raiseOverUsed}>
                Subir até o valor já usado
              </button>
              <p className="text-xs">
                Depois use <strong>Ajustar automaticamente</strong> para tirar a diferença das
                outras rubricas.
              </p>
            </div>
          ) : null}

          <p className="text-xs text-[var(--gray-500)]">
            Digite o novo valor de cada rubrica. Dá para passar do homologado em até{" "}
            {rubricOverrunPct.toLocaleString("pt-BR")}% (custos vinculados não passam). O valor não
            pode ficar abaixo do que já foi usado.
          </p>

          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.key} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3 border-b-2 border-[var(--navy-soft)] pb-1">
                  <h3 className="text-sm font-semibold text-[var(--navy)]">
                    {g.productName}
                    <span className="font-normal text-[var(--gray-500)]"> · {g.stageName}</span>
                  </h3>
                  <span className="text-xs tabular-nums text-[var(--gray-500)]">
                    {formatCurrency(g.lines.reduce((acc, l) => acc + (values[l.id] ?? l.approvedAmount), 0))}
                  </span>
                </div>
                <ul className="space-y-3">
                  {g.lines.map((line) => {
                    const admin = Boolean(line.isAdmin);
                    const locked = Boolean(line.locked);
                    const max = admin
                      ? round2(line.approvedAmount)
                      : round2(line.homologatedAmount * (1 + rubricOverrunPct / 100));
                    const min = round2(line.reserved);
                    const value = values[line.id] ?? line.approvedAmount;
                    const aboveHomolog = !admin && value > line.homologatedAmount + 0.005;
                    const delta = round2(value - line.homologatedAmount);

                    return (
                      <li
                        key={line.id}
                        className={`rounded-xl border px-4 py-3 ${
                          locked
                            ? "border-blue-300 bg-blue-50 opacity-90"
                            : admin
                              ? "border-[var(--border)] bg-[var(--gray-50)]"
                              : aboveHomolog
                                ? "border-amber-300 bg-amber-50/60"
                                : "border-[var(--border)] bg-white"
                        }`}
                      >
                        <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_11rem]">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--navy)]">
                              {formatRubricShortLabel(line)}
                              {locked ? (
                                <span className="ml-2 text-xs font-semibold text-blue-800">
                                  bloqueada
                                </span>
                              ) : admin ? (
                                <span className="ml-2 text-xs font-normal text-[var(--gray-500)]">
                                  custo vinculado
                                </span>
                              ) : null}
                            </p>
                            {line.state || line.city ? (
                              <p className="truncate text-xs text-[var(--gray-500)]">
                                {line.state}
                                {line.city ? ` - ${line.city}` : ""}
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[var(--gray-500)]">
                              Homologado
                            </p>
                            <p className="text-sm tabular-nums">{formatCurrency(line.homologatedAmount)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[var(--gray-500)]">
                              Já usado
                            </p>
                            <p className="text-sm tabular-nums">{formatCurrency(line.reserved)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[var(--gray-500)]">
                              Novo valor
                            </p>
                            {admin || locked ? (
                              <p
                                className="text-sm font-semibold tabular-nums text-[var(--navy)]"
                                title={
                                  locked
                                    ? "Rubrica bloqueada: desbloqueie na planilha para editar"
                                    : "Custo vinculado não pode ser alterado aqui"
                                }
                              >
                                {formatCurrency(value)}
                              </p>
                            ) : (
                              <MoneyInput
                                value={value}
                                ariaLabel={`Novo valor de ${line.itemName}`}
                                onChange={(next) => setLineValue(line.id, next)}
                              />
                            )}
                            {!admin && !locked && value < min - 0.005 ? (
                              <p className="text-xs text-red-700">Abaixo do já usado ({formatCurrency(min)})</p>
                            ) : !admin && !locked && value > max + 0.005 ? (
                              <p className="text-xs text-red-700">Acima do máximo ({formatCurrency(max)})</p>
                            ) : Math.abs(delta) >= 0.005 ? (
                              <p
                                className={`text-xs tabular-nums ${
                                  delta > 0 ? "text-amber-700" : "text-[var(--gray-500)]"
                                }`}
                              >
                                {delta > 0 ? "+" : "−"}
                                {formatCurrency(Math.abs(delta))}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-white p-5">
          <div className="text-sm">
            <p className={`text-xs ${canSave ? "text-emerald-700" : "text-amber-700"}`}>
              {canSave
                ? "Totais conferem — pode salvar."
                : belowUsed > 0
                  ? `${belowUsed} rubrica(s) abaixo do valor já usado: suba até o usado.`
                  : aboveMax > 0
                    ? `${aboveMax} rubrica(s) acima do máximo permitido: diminua o valor.`
                  : diff > 0
                  ? `Sobram ${formatCurrency(diff)}: tire esse valor de outras rubricas.`
                  : `Faltam ${formatCurrency(-diff)}: distribua esse valor em outras rubricas.`}
            </p>
            {hint ? <p className="text-xs text-[var(--gray-600)]">{hint}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {!canSave ? (
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={autoAdjust}>
                Ajustar automaticamente
              </button>
            ) : null}
          <button type="button" className="btn" disabled={!canSave || pending} onClick={save}>
            {pending ? "Salvando…" : "Salvar redistribuição"}
          </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {!hideTrigger ? (
        <button
          type="button"
          className={
            menuItem
              ? "w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--navy)] hover:bg-[var(--gray-50)]"
              : (triggerClassName ?? "btn")
          }
          onClick={(e) => {
            e.stopPropagation();
            startEdit();
          }}
          disabled={pending}
        >
          Editar rubricas
        </button>
      ) : null}
      {mounted && editor ? createPortal(editor, document.body) : null}
    </>
  );
}
