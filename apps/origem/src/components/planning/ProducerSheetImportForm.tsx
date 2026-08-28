"use client";

import { useActionState, useEffect, useState } from "react";
import {
  confirmProducerReservations,
  parseProducerSheetAction,
} from "@/lib/planning/manual-commitment";
import type { ActionState } from "@/lib/planning/action-state";
import type { ProducerSheetRow } from "@/lib/planning/producer-sheet";
import { formatCurrency } from "@/lib/format";
import type { RubricSelectOption } from "@/components/planning/RubricSearchSelect";

type ParseState = ActionState & { rows?: ProducerSheetRow[] };

const parseInitial: ParseState = {};
const confirmInitial: ActionState = {};

type ReviewRow = ProducerSheetRow & {
  budgetLineId: string;
  include: boolean;
};

export function ProducerSheetImportForm({
  planningProjectId,
  rubricOptions,
}: {
  planningProjectId: string;
  rubricOptions: RubricSelectOption[];
}) {
  const parseAction = parseProducerSheetAction.bind(null, planningProjectId);
  const confirmAction = confirmProducerReservations.bind(null, planningProjectId);
  const [parseState, parseFormAction, parsePending] = useActionState(
    parseAction,
    parseInitial,
  );
  const [confirmState, confirmFormAction, confirmPending] = useActionState(
    confirmAction,
    confirmInitial,
  );
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);

  useEffect(() => {
    if (parseState.ok && parseState.rows) {
      setReviewRows(
        parseState.rows.map((r) => ({
          ...r,
          budgetLineId: r.suggestedLineId || rubricOptions[0]?.id || "",
          include: r.amount > 0 && Boolean(r.supplier),
        })),
      );
    }
  }, [parseState.ok, parseState.rows, rubricOptions]);

  return (
    <div className="space-y-6">
      <form
        action={parseFormAction}
        className="card space-y-4 p-5"
      >
        <div>
          <h2 className="font-semibold text-[var(--navy)]">
            Importar planilha do produtor
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            Colunas: Item, Valor, Fornecedor, CNPJ/CPF, Observação.{" "}
            <a
              href={`/planejamento/${planningProjectId}/importar-produtor/template`}
              className="text-[var(--gold)] hover:underline"
            >
              Baixar template
            </a>
          </p>
        </div>
        {parseState.error ? (
          <p className="text-sm text-red-700">{parseState.error}</p>
        ) : null}
        <label className="field">
          <span>Arquivo (.xlsx ou .csv)</span>
          <input name="sheetFile" type="file" accept=".xlsx,.csv" required />
        </label>
        <button type="submit" className="btn" disabled={parsePending}>
          {parsePending ? "Lendo…" : "Analisar planilha"}
        </button>
      </form>

      {reviewRows.length > 0 ? (
        <form action={confirmFormAction} className="card space-y-4 p-5">
          <h2 className="font-semibold text-[var(--navy)]">Revisar reservas</h2>
          {confirmState.error ? (
            <p className="text-sm text-red-700">{confirmState.error}</p>
          ) : null}
          <input
            type="hidden"
            name="rowsJson"
            value={JSON.stringify(
              reviewRows.map((r) => ({
                budgetLineId: r.budgetLineId,
                amount: r.amount,
                supplier: r.supplier,
                cnpj: r.cnpj,
                item: r.item,
                notes: r.notes,
                include: r.include,
              })),
            )}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--gray-500)]">
                  <th className="py-2 pr-2">Incluir</th>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2">Fornecedor</th>
                  <th className="py-2 pr-2">Valor</th>
                  <th className="py-2">Rubrica</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map((r, idx) => (
                  <tr key={r.rowIndex} className="border-t border-[var(--border)]">
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => {
                          const next = [...reviewRows];
                          next[idx] = { ...r, include: e.target.checked };
                          setReviewRows(next);
                        }}
                      />
                    </td>
                    <td className="py-2 pr-2">{r.item}</td>
                    <td className="py-2 pr-2">{r.supplier || "—"}</td>
                    <td className="py-2 pr-2 tabular-nums">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="py-2">
                      <select
                        className="w-full min-w-[12rem]"
                        value={r.budgetLineId}
                        onChange={(e) => {
                          const next = [...reviewRows];
                          next[idx] = { ...r, budgetLineId: e.target.value };
                          setReviewRows(next);
                        }}
                      >
                        {rubricOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {r.suggestionReasons.length > 0 ? (
                        <p className="mt-0.5 text-xs text-[var(--gray-400)]">
                          Sugestão: {r.suggestionReasons.join(" · ")}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="submit" className="btn" disabled={confirmPending}>
            {confirmPending ? "Criando reservas…" : "Confirmar reservas em lote"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
