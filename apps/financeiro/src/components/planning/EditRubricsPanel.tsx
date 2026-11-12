"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
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

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
  const canSave = Math.abs(diff) < 0.005 && belowUsed === 0;

  const boundsOf = (line: EditableRubricLine) => ({
    max: line.isAdmin
      ? round2(line.approvedAmount)
      : round2(line.homologatedAmount * (1 + rubricOverrunPct / 100)),
    min: round2(line.reserved),
  });

  // Rubricas com reservado/pago acima do aprovado: precisam de readequação.
  const overUsed = lines.filter(
    (l) => !l.locked && !l.isAdmin && round2(l.reserved) > round2(l.approvedAmount) + 0.005,
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

  function setLineValue(id: string, raw: number, max: number, min: number) {
    const clamped = Math.min(max, Math.max(min, round2(raw)));
    setValues((prev) => ({ ...prev, [id]: clamped }));
  }

  function startEdit() {
    setValues(Object.fromEntries(lines.map((l) => [l.id, round2(l.approvedAmount)])));
    setExpanded({});
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
            Clique no ícone <strong>+</strong> de cada linha para ajustar. Máximo{" "}
            {rubricOverrunPct.toLocaleString("pt-BR")}% acima do valor homologado (exceto
            Administração), conforme o limite do projeto.
          </p>

          <ul className="space-y-2">
            {lines.map((line) => {
              const admin = Boolean(line.isAdmin);
              const locked = Boolean(line.locked);
              const max = admin
                ? round2(line.approvedAmount)
                : round2(line.homologatedAmount * (1 + rubricOverrunPct / 100));
              const min = round2(line.reserved);
              const value = values[line.id] ?? line.approvedAmount;
              const open = Boolean(expanded[line.id]);
              const aboveHomolog = !admin && value > line.homologatedAmount + 0.005;

              return (
                <li
                  key={line.id}
                  className={`rounded-xl border px-3 py-2 ${
                    locked
                      ? "border-blue-300 bg-blue-50 opacity-90"
                      : admin
                      ? "border-[var(--border)] bg-[var(--gray-50)]"
                      : aboveHomolog
                        ? "border-amber-300 bg-amber-50/60"
                        : "border-[var(--border)] bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      title={
                        locked
                          ? "Rubrica bloqueada — desbloqueie na árvore para editar"
                          : admin
                          ? "Administração não pode ser excedida"
                          : "Ajustar / exceder rubrica"
                      }
                      aria-label={`Ajustar rubrica ${line.itemName}`}
                      aria-expanded={open}
                      disabled={admin || locked}
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                        admin || locked
                          ? "cursor-not-allowed border-[var(--border)] text-[var(--gray-400)]"
                          : open
                            ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                            : "border-[var(--border)] text-[var(--navy)] hover:bg-[var(--gray-50)]"
                      }`}
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [line.id]: !prev[line.id],
                        }))
                      }
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M4 12h16M12 4v16"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--navy)]">
                        {formatRubricShortLabel(line)}
                        {locked ? (
                          <span className="ml-2 text-xs font-semibold text-blue-800">
                            bloqueada
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-[var(--gray-500)]">
                        {line.stageName}
                        {line.state || line.city
                          ? ` · ${line.state}${line.city ? ` - ${line.city}` : ""}`
                          : ""}
                        {" · "}homologado {formatCurrency(line.homologatedAmount)}
                        {line.reserved > 0
                          ? ` · reservado ${formatCurrency(line.reserved)}`
                          : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--navy)]">
                      {formatCurrency(value)}
                    </p>
                  </div>

                  {open ? (
                    <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3 pl-12">
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={1}
                          value={Math.min(max, Math.max(min, value))}
                          className="min-w-[12rem] flex-1"
                          onChange={(e) =>
                            setLineValue(line.id, Number(e.target.value), max, min)
                          }
                        />
                        <label className="field w-[9rem]">
                          <span className="sr-only">Valor</span>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            step={0.01}
                            value={value}
                            className="w-full tabular-nums"
                            onChange={(e) =>
                              setLineValue(line.id, Number(e.target.value), max, min)
                            }
                          />
                        </label>
                      </div>
                      <p className="text-xs text-[var(--gray-500)]">
                        Mín. {formatCurrency(min)} (reservado) · Máx. {formatCurrency(max)} (+
                        {rubricOverrunPct.toLocaleString("pt-BR")}% do homologado)
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-white p-5">
          <div className="text-sm">
            <p className="tabular-nums">
              Soma: <strong>{formatCurrency(sum)}</strong>
              {" · "}
              Alvo: <strong>{formatCurrency(target)}</strong>
            </p>
            <p className={`text-xs ${canSave ? "text-emerald-700" : "text-amber-700"}`}>
              {canSave
                ? "Totais conferem — pode salvar."
                : belowUsed > 0
                  ? `${belowUsed} rubrica(s) abaixo do valor já usado: suba até o usado.`
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
