"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DialogShell } from "@/components/ui/AppDialog";
import { EngagementDocsButton } from "@/components/catalog/EngagementDocsButton";
import { formatCurrency, formatDate } from "@/lib/format";
import { listRubricEntries, type RubricEntry } from "@/lib/planning/rubric-entries";

/**
 * Nome do item na planilha (com o número). Clicar abre os lançamentos da
 * rubrica: quem recebeu, quanto, situação e os arquivos da NF e do comprovante.
 */
export function RubricEntriesButton({
  budgetLineId,
  itemNumber,
  itemName,
  paid,
}: {
  budgetLineId: string;
  itemNumber: number;
  itemName: string;
  /** Pago na rubrica (inclui o que já estava no SALIC). */
  paid: number;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RubricEntry[] | null>(null);
  const [pending, start] = useTransition();

  const openDialog = () => {
    setOpen(true);
    start(async () => {
      const res = await listRubricEntries(budgetLineId);
      setEntries(res.entries);
    });
  };

  const paidInSystem = (entries ?? [])
    .filter((e) => e.status === "PAID")
    .reduce((s, e) => s + e.amount, 0);
  const paidOnlyInSalic = Math.max(0, Math.round((paid - paidInSystem) * 100) / 100);

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-left hover:text-[var(--gold)] hover:underline"
        title="Ver lançamentos desta rubrica"
      >
        <span className="tabular-nums text-[var(--gray-500)]">{itemNumber}.</span> {itemName}
      </button>
      <DialogShell open={open} onClose={() => setOpen(false)} labelledBy={`rubrica-${budgetLineId}`}>
        <div className="max-h-[80vh] space-y-3 overflow-y-auto px-5 py-5">
          <h2 id={`rubrica-${budgetLineId}`} className="text-base font-semibold text-[var(--navy)]">
            {itemNumber}. {itemName}
          </h2>
          {pending || entries === null ? (
            <p className="text-sm text-[var(--gray-500)]">Carregando…</p>
          ) : entries.length === 0 && paidOnlyInSalic === 0 ? (
            <p className="text-sm text-[var(--gray-500)]">Nenhum lançamento nesta rubrica.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {entries.map((e) => (
                <li key={e.commitmentId} className="space-y-1 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/planejamento/compromissos/${e.commitmentId}`}
                      className="font-medium text-[var(--navy)] hover:underline"
                    >
                      {e.supplierName}
                      {e.pedidoParcel ? ` · parcela ${e.pedidoParcel}` : ""}
                    </Link>
                    <span className="font-semibold tabular-nums">{formatCurrency(e.amount)}</span>
                  </div>
                  <p className="text-xs text-[var(--gray-500)]">
                    {e.status === "PAID"
                      ? `Pago${e.date ? ` em ${formatDate(e.date)}` : ""}`
                      : `Reservado${e.date ? ` · previsto ${formatDate(e.date)}` : ""}`}
                    {e.nfPending ? " · sem NF" : ""}
                    {e.isReimbursement ? " · reembolso" : ""}
                  </p>
                  {/* Docs sempre na linha de baixo, como em Fornecedores. */}
                  <div className="pt-1">
                    <EngagementDocsButton serviceName={e.supplierName} documents={e.docs} />
                  </div>
                </li>
              ))}
              {paidOnlyInSalic > 0 ? (
                <li className="py-2 text-xs text-amber-900">
                  {formatCurrency(paidOnlyInSalic)} pagos direto no SALIC, sem lançamento no
                  sistema.
                </li>
              ) : null}
            </ul>
          )}
          <div className="flex justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      </DialogShell>
    </>
  );
}
