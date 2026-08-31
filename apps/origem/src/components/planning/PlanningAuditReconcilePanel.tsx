"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import type {
  AuditPlanningMatchRow,
  AuditPlanningMatchStatus,
  AuditPlanningReconcileReport,
} from "@/lib/planning/federal/audit-reconcile";
import {
  getAuditPlanningReconcileReport,
  importAuditPaymentToPlanning,
  reconcileSalicPublishState,
} from "@/lib/planning/federal/actions";
import { AlertDialog, ConfirmDialog } from "@/components/ui/AppDialog";

const STATUS_LABEL: Record<AuditPlanningMatchStatus, string> = {
  ALIGNED: "Alinhado",
  AUDIT_ONLY: "Só auditoria",
  PLANNING_ONLY: "Só planejamento",
  DIVERGENT: "Divergente",
};

const STATUS_CLASS: Record<AuditPlanningMatchStatus, string> = {
  ALIGNED: "bg-emerald-100 text-emerald-800",
  AUDIT_ONLY: "bg-amber-100 text-amber-900",
  PLANNING_ONLY: "bg-sky-100 text-sky-900",
  DIVERGENT: "bg-red-100 text-red-900",
};

type FilterKey = "ALL" | AuditPlanningMatchStatus;

export function PlanningAuditReconcilePanel({
  planningProjectId,
  canPublishSalic,
  initialReport = null,
}: {
  planningProjectId: string;
  canPublishSalic: boolean;
  initialReport?: AuditPlanningReconcileReport | null;
}) {
  const [report, setReport] = useState<AuditPlanningReconcileReport | null>(initialReport);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importPaymentId, setImportPaymentId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [reconciling, setReconciling] = useState(false);
  const router = useRouter();
  const busy = pending || reconciling;

  useEffect(() => {
    if (initialReport) setReport(initialReport);
  }, [initialReport]);

  useEffect(() => {
    if (initialReport || !canPublishSalic) return;
    start(async () => {
      const result = await getAuditPlanningReconcileReport(planningProjectId);
      if (result.report) setReport(result.report);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [planningProjectId, canPublishSalic]);

  const rows = useMemo(() => {
    if (!report) return [];
    if (filter === "ALL") return report.rows;
    return report.rows.filter((r) => r.status === filter);
  }, [report, filter]);

  function runReconcile() {
    setError(null);
    setMessage(null);
    setReconciling(true);
    reconcileSalicPublishState(planningProjectId)
      .then((result) => {
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.auditReport) setReport(result.auditReport);
        if (result.message) setMessage(result.message);
        router.refresh();
      })
      .finally(() => setReconciling(false));
  }

  function confirmImport() {
    if (!importPaymentId) return;
    const paymentId = importPaymentId;
    setError(null);
    setMessage(null);
    start(async () => {
      const result = await importAuditPaymentToPlanning(planningProjectId, paymentId);
      setImportPaymentId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message || "Importado.");
      const refreshed = await getAuditPlanningReconcileReport(planningProjectId);
      if (refreshed.report) setReport(refreshed.report);
      router.refresh();
    });
  }

  if (!canPublishSalic) return null;

  const counts = report?.counts;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--gray-50)] px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--navy)]">
            Planejamento × Auditoria
          </h3>
          <p className="mt-0.5 text-xs text-[var(--gray-500)]">
            {report?.linkedToAudit
              ? "Cruzamento por id do comprovante SALIC entre reservas e pagamentos da auditoria."
              : "Projeto ainda sem vínculo de auditoria — mostre só o lado do planejamento."}
          </p>
        </div>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={runReconcile}
        >
          {reconciling ? "Conferindo…" : "Conferir SALIC + auditoria"}
        </button>
      </div>

      {message ? (
        <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      {counts ? (
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-5 py-3">
          {(
            [
              ["ALL", "Todos", report!.rows.length],
              ["ALIGNED", STATUS_LABEL.ALIGNED, counts.aligned],
              ["AUDIT_ONLY", STATUS_LABEL.AUDIT_ONLY, counts.auditOnly],
              ["PLANNING_ONLY", STATUS_LABEL.PLANNING_ONLY, counts.planningOnly],
              ["DIVERGENT", STATUS_LABEL.DIVERGENT, counts.divergent],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === key
                  ? "bg-[var(--navy)] text-white"
                  : "bg-[var(--gray-200)] text-[var(--gray-700)] hover:bg-[var(--gray-300)]"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-[var(--gray-500)]">
          {busy ? "Carregando cruzamento…" : "Nenhum dado ainda. Clique em Conferir."}
        </p>
      )}

      {rows.length > 0 ? (
        <div className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <MatchRow
              key={`${row.status}-${row.paymentId || row.proofId || row.paymentExternalId}`}
              row={row}
              busy={busy}
              onImport={
                row.status === "AUDIT_ONLY" && row.paymentId
                  ? () => setImportPaymentId(row.paymentId)
                  : undefined
              }
              planningProjectId={planningProjectId}
            />
          ))}
        </div>
      ) : report ? (
        <p className="px-5 py-6 text-center text-sm text-[var(--gray-500)]">
          Nenhum item neste filtro.
        </p>
      ) : null}

      <ConfirmDialog
        open={Boolean(importPaymentId)}
        title="Importar como reserva paga?"
        description="Cria no planejamento uma reserva PAID ligada a este pagamento da auditoria (sem arquivo PDF — apenas vínculo e rubrica)."
        confirmLabel="Importar"
        pending={pending}
        onCancel={() => setImportPaymentId(null)}
        onConfirm={confirmImport}
      />

      <AlertDialog
        open={Boolean(error)}
        title="Falha"
        description={error ?? ""}
        tone="error"
        onClose={() => setError(null)}
      />
    </div>
  );
}

function MatchRow({
  row,
  busy,
  onImport,
  planningProjectId,
}: {
  row: AuditPlanningMatchRow;
  busy: boolean;
  onImport?: () => void;
  planningProjectId: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[row.status]}`}
          >
            {STATUS_LABEL[row.status]}
          </span>
          <p className="font-medium text-[var(--navy)]">{row.supplierName}</p>
        </div>
        <p className="mt-0.5 text-sm text-[var(--gray-500)]">
          {row.rubricItem || "Rubrica não informada"}
          {row.planilhaAprovacaoId ? ` · planilha ${row.planilhaAprovacaoId}` : ""}
        </p>
        <p className="mt-0.5 text-xs text-[var(--gray-400)]">
          {row.paymentDate ? `Pago ${formatDate(row.paymentDate)} · ` : ""}
          {row.paymentExternalId ? `SALIC #${row.paymentExternalId}` : "Sem id SALIC"}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="text-right text-sm">
          {row.auditAmount != null ? (
            <p className="tabular-nums text-[var(--gray-600)]">
              Auditoria {formatCurrency(row.auditAmount)}
            </p>
          ) : null}
          {row.planningAmount != null ? (
            <p className="tabular-nums font-semibold text-[var(--navy)]">
              Planej. {formatCurrency(row.planningAmount)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {onImport ? (
            <button type="button" className="btn" disabled={busy} onClick={onImport}>
              Importar como pago
            </button>
          ) : null}
          {row.commitmentId ? (
            <Link
              href={`/planejamento/compromissos/${row.commitmentId}`}
              className="btn btn-ghost text-xs"
            >
              Abrir reserva
            </Link>
          ) : (
            <Link
              href={`/planejamento/${planningProjectId}/reservas`}
              className="btn btn-ghost text-xs"
            >
              Reservas
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
