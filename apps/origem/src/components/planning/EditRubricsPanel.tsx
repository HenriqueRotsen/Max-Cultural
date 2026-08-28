"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { saveRubricReallocation } from "@/lib/planning/actions";

export type EditableRubricLine = {
  id: string;
  itemName: string;
  stageName: string;
  productName: string;
  city: string;
  state: string;
  homologatedAmount: number;
  approvedAmount: number;
  reserved: number;
  isAdmin?: boolean;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function EditRubricsPanel({
  planningProjectId,
  totalApproved,
  lines,
  menuItem = false,
}: {
  planningProjectId: string;
  totalApproved: number;
  lines: EditableRubricLine[];
  menuItem?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, round2(l.approvedAmount)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setSlot(document.querySelector<HTMLElement>("[data-edit-rubrics-slot]"));
  }, []);

  const sum = useMemo(
    () => round2(Object.values(values).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)),
    [values],
  );
  const target = round2(totalApproved);
  const diff = round2(sum - target);
  const canSave = Math.abs(diff) < 0.005;

  function setLineValue(id: string, raw: number, max: number, min: number) {
    const clamped = Math.min(max, Math.max(min, round2(raw)));
    setValues((prev) => ({ ...prev, [id]: clamped }));
  }

  function startEdit() {
    setValues(Object.fromEntries(lines.map((l) => [l.id, round2(l.approvedAmount)])));
    setExpanded({});
    setError(null);
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

  const panel =
    editing && slot
      ? createPortal(
          <div className="card space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[var(--navy)]">Editar rubricas</h2>
                <p className="mt-1 text-sm text-[var(--gray-500)]">
                  Clique no ícone da linha para ajustar. Cada linha pode ir até o dobro do valor
                  homologado; a soma deve fechar em {formatCurrency(target)}.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={cancel}
                disabled={pending}
              >
                Cancelar
              </button>
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <ul className="space-y-2">
              {lines.map((line) => {
                const admin = Boolean(line.isAdmin);
                const max = admin
                  ? round2(line.approvedAmount)
                  : round2(line.homologatedAmount * 2);
                const min = round2(line.reserved);
                const value = values[line.id] ?? line.approvedAmount;
                const open = Boolean(expanded[line.id]);
                const aboveHomolog = !admin && value > line.homologatedAmount + 0.005;

                return (
                  <li
                    key={line.id}
                    className={`rounded-xl border px-3 py-2 ${
                      admin
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
                          admin
                            ? "Administração não pode ser excedida"
                            : "Ajustar / exceder rubrica"
                        }
                        aria-label={`Ajustar rubrica ${line.itemName}`}
                        aria-expanded={open}
                        disabled={admin}
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                          admin
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
                          <path
                            d="M8 8h8v8H8V8Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                            opacity="0.35"
                          />
                        </svg>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--navy)]">
                          {line.itemName}
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
                            step={0.01}
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
                          Mín. {formatCurrency(min)} (reservado) · Máx. {formatCurrency(max)}{" "}
                          (2× homologado)
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-white pt-4">
              <div className="text-sm">
                <p className="tabular-nums">
                  Soma: <strong>{formatCurrency(sum)}</strong>
                  {" · "}
                  Alvo: <strong>{formatCurrency(target)}</strong>
                </p>
                <p
                  className={`text-xs ${
                    canSave ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {canSave
                    ? "Totais conferem — pode salvar."
                    : `Diferença: ${formatCurrency(diff)} (precisa fechar em zero)`}
                </p>
              </div>
              <button
                type="button"
                className="btn"
                disabled={!canSave || pending}
                onClick={save}
              >
                {pending ? "Salvando…" : "Salvar redistribuição"}
              </button>
            </div>
          </div>,
          slot,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={
          menuItem
            ? "w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--navy)] hover:bg-[var(--gray-50)]"
            : editing
              ? "btn-secondary"
              : "btn"
        }
        onClick={editing ? cancel : startEdit}
        disabled={pending}
      >
        {editing ? "Cancelar" : "Editar rubricas"}
      </button>
      {panel}
    </>
  );
}
