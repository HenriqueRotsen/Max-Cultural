"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addStateBudgetLine,
  removeStateBudgetLine,
  updateStateBudgetLine,
} from "@/lib/planning/state-lines";
import type { ActionState } from "@/lib/planning/action-state";
import { formatCurrency } from "@/lib/format";

export type StateBudgetLineRow = {
  id: string;
  fonteRecurso: string;
  productName: string;
  stageName: string;
  state: string;
  city: string;
  itemName: string;
  unit: string;
  quantity: number;
  occurrences: number;
  unitPrice: number;
  approvedAmount: number;
  reserved: number;
  inUse: boolean;
};

function LineFields({ uf, line }: { uf: string; line?: StateBudgetLineRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Fonte de recurso</span>
        <input name="fonteRecurso" defaultValue={line?.fonteRecurso ?? "Incentivo estadual"} />
      </label>
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Produto</span>
        <input name="productName" required defaultValue={line?.productName} />
      </label>
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Etapa</span>
        <input name="stageName" defaultValue={line?.stageName ?? "Execução"} />
      </label>
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Item (rubrica)</span>
        <input name="itemName" required defaultValue={line?.itemName} />
      </label>
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">UF</span>
        <input name="state" maxLength={2} defaultValue={line?.state ?? uf} />
      </label>
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Município</span>
        <input name="city" defaultValue={line?.city} />
      </label>
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Unidade</span>
        <input name="unit" defaultValue={line?.unit ?? "Unidade"} />
      </label>
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Quantidade</span>
        <input name="quantity" inputMode="decimal" required defaultValue={line?.quantity ?? 1} />
      </label>
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Ocorrência</span>
        <input name="occurrences" inputMode="decimal" required defaultValue={line?.occurrences ?? 1} />
      </label>
      <label className="field">
        <span className="text-xs text-[var(--gray-500)]">Valor unitário (R$)</span>
        <input name="unitPrice" inputMode="decimal" required defaultValue={line?.unitPrice} />
      </label>
    </div>
  );
}

function EditLineForm({ line, uf, onDone }: { line: StateBudgetLineRow; uf: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const r = await updateStateBudgetLine(line.id, prev, fd);
      if (r.ok) onDone();
      return r;
    },
    {},
  );
  return (
    <form action={action} className="space-y-3 border-t border-[var(--border)] bg-[var(--gray-50)] p-4">
      <LineFields uf={uf} line={line} />
      {line.reserved > 0 ? (
        <p className="text-xs text-[var(--gray-500)]">
          Já reservado/pago nesta rubrica: {formatCurrency(line.reserved)} — o valor não pode ficar abaixo disso.
        </p>
      ) : null}
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Rubricas do projeto estadual: lançadas à mão (mesma estrutura do federal). */
export function StateBudgetEditor({
  projectId,
  uf,
  lines,
  canEdit,
}: {
  projectId: string;
  uf: string;
  lines: StateBudgetLineRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(lines.length === 0);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const [addState, addAction, addPending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const r = await addStateBudgetLine(projectId, prev, fd);
      if (r.ok) setAdding(false);
      return r;
    },
    {},
  );
  const total = lines.reduce((s, l) => s + l.approvedAmount, 0);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="font-semibold text-[var(--navy)]">Rubricas do projeto</h2>
          <p className="text-sm text-[var(--gray-500)]">
            Projeto estadual: lance cada rubrica com quantidade, ocorrência e valor unitário. Total:{" "}
            <strong>{formatCurrency(total)}</strong>
          </p>
        </div>
        {canEdit && !adding ? (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            Adicionar rubrica
          </button>
        ) : null}
      </div>

      {adding && canEdit ? (
        <form action={addAction} className="space-y-3 border-b border-[var(--border)] bg-[var(--gray-50)] p-4">
          <LineFields uf={uf} />
          {addState.error ? <p className="text-sm text-red-700">{addState.error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="btn" disabled={addPending}>
              {addPending ? "Adicionando…" : "Adicionar"}
            </button>
            {lines.length > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {removeError ? <p className="px-5 pt-3 text-sm text-red-700">{removeError}</p> : null}

      {lines.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--gray-500)]">Nenhuma rubrica lançada ainda.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {lines.map((l) => (
            <li key={l.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--navy)]">{l.itemName}</p>
                  <p className="text-xs text-[var(--gray-500)]">
                    {l.productName} · {l.stageName}
                    {l.city || l.state ? ` · ${[l.city, l.state].filter(Boolean).join("/")}` : ""} ·{" "}
                    {l.quantity} × {l.occurrences} × {formatCurrency(l.unitPrice)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-[var(--navy)]">{formatCurrency(l.approvedAmount)}</span>
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setEditing(editing === l.id ? null : l.id)}
                      >
                        Editar
                      </button>
                      {!l.inUse ? (
                        <button
                          type="button"
                          className="btn btn-ghost text-red-700"
                          disabled={removing}
                          onClick={() => {
                            if (!window.confirm(`Remover a rubrica “${l.itemName}”?`)) return;
                            startRemove(async () => {
                              const r = await removeStateBudgetLine(l.id);
                              setRemoveError(r.error ?? null);
                            });
                          }}
                        >
                          Remover
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              {editing === l.id ? <EditLineForm line={l} uf={uf} onDone={() => setEditing(null)} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
