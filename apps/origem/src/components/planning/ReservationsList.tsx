"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  commitmentStatusLabel,
  nfPendingBadge,
} from "@/lib/planning/lifecycle";
import { formatRubricShortLabel } from "@/lib/planning/rubric-label";
import type { SalicRelacaoPagamento } from "@/lib/planning/federal/salic-reconcile";
import {
  markSalicProofRemovedLocally,
  publishAllCommitmentsToSalic,
  publishCommitmentToSalic,
  reconcileSalicPublishState,
} from "@/lib/planning/federal/actions";
import { AlertDialog, ConfirmDialog } from "@/components/ui/AppDialog";
import {
  SalicUploadPreviewModal,
  type SalicUploadPreviewItem,
} from "@/components/planning/SalicUploadPreviewModal";
import { buildSalicUploadFilename, resolveSalicItemNumber } from "@/lib/salic/salic-publish-metadata";

export type ReservationRow = {
  id: string;
  amount: number;
  status: string;
  nfPending: boolean;
  createdAt: string;
  paidAt: string | null;
  supplierName: string;
  serviceName: string;
  budgetLine: {
    sortOrder: number;
    itemName: string;
    stageName: string;
    productName: string;
  };
  salic: {
    canUpload: boolean;
    uploaded: boolean;
    publishMode: string | null;
    reason: string | null;
    proofId: string | null;
    uploadFilename: string | null;
    fiscalDocumentId: string | null;
    fiscalKind: "NF" | "RPA" | null;
    fiscalNumber: string | null;
  };
};

function SalicPaymentsPanel({ items }: { items: SalicRelacaoPagamento[] }) {
  if (items.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--gray-50)] px-5 py-3">
        <h3 className="text-sm font-semibold text-[var(--navy)]">
          Comprovantes no SALIC ({items.length})
        </h3>
        <p className="mt-0.5 text-xs text-[var(--gray-500)]">
          Pagamentos registrados no portal do SALIC para este PRONAC.
        </p>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="font-medium text-[var(--navy)]">{item.supplierName}</p>
              <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                {item.rubricItem || "Item não informado"}
                {item.proofNumber ? ` · comp. ${item.proofNumber}` : ""}
              </p>
              {item.paymentDate ? (
                <p className="mt-0.5 text-xs text-[var(--gray-400)]">
                  Pago em {item.paymentDate}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 tabular-nums font-semibold text-[var(--navy)]">
              {formatCurrency(item.amount)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReservationsList({
  planningProjectId,
  isFederal,
  canPublishSalic,
  rows,
}: {
  planningProjectId: string;
  isFederal: boolean;
  canPublishSalic: boolean;
  rows: ReservationRow[];
}) {
  const [pending, start] = useTransition();
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [salicItems, setSalicItems] = useState<SalicRelacaoPagamento[]>([]);
  const [previewItems, setPreviewItems] = useState<SalicUploadPreviewItem[]>([]);
  const [previewMode, setPreviewMode] = useState<"one" | "all" | null>(null);
  const [confirmRemoveProofId, setConfirmRemoveProofId] = useState<string | null>(null);
  const router = useRouter();

  const uploadableRows = rows.filter((r) => r.salic.canUpload && r.salic.proofId);
  const uploadableCount = uploadableRows.length;
  const busy = pending || reconciling;
  const showSalicTools = isFederal && canPublishSalic;

  function applyReconcileResult(
    result: Awaited<ReturnType<typeof reconcileSalicPublishState>>,
    options?: { silent?: boolean },
  ) {
    if (result.error) {
      if (!options?.silent) setError(result.error);
      return;
    }
    if (result.salicItems) setSalicItems(result.salicItems);
    if (result.message && !options?.silent) {
      setMessage(result.message);
    } else if (options?.silent && result.message) {
      if ((result.cleared ?? 0) > 0 || (result.salicCount ?? 0) > 0) {
        setMessage(result.message);
      }
    }
    if ((result.cleared ?? 0) > 0 || (result.comprovadoLinesUpdated ?? 0) > 0) {
      router.refresh();
    }
  }

  function runReconcile(options?: { silent?: boolean }) {
    setError(null);
    if (!options?.silent) setMessage(null);
    setReconciling(true);

    reconcileSalicPublishState(planningProjectId)
      .then((result) => applyReconcileResult(result, options))
      .finally(() => setReconciling(false));
  }

  function rowToPreviewItem(row: ReservationRow): SalicUploadPreviewItem | null {
    if (!row.salic.proofId) return null;
    return {
      commitmentId: row.id,
      proofId: row.salic.proofId,
      title: row.supplierName,
      subtitle: `${row.serviceName} · ${formatRubricShortLabel(row.budgetLine)}`,
      amount: row.amount,
      publishMode:
        row.salic.publishMode === "MERGED" || row.salic.publishMode === "PROOF_ONLY"
          ? row.salic.publishMode
          : null,
      uploadFilename: row.salic.uploadFilename,
      fiscalDocumentId: row.salic.fiscalDocumentId,
      fiscalKind: row.salic.fiscalKind,
      fiscalNumber: row.salic.fiscalNumber,
      itemNumber: resolveSalicItemNumber(row.budgetLine.sortOrder),
      supplierName: row.supplierName,
    };
  }

  function handleFiscalNumberUpdated(
    proofId: string,
    fiscalNumber: string,
    itemNumber: number | null,
    supplierName: string,
  ) {
    setPreviewItems((items) =>
      items.map((item) =>
        item.proofId === proofId
          ? {
              ...item,
              fiscalNumber,
              uploadFilename: buildSalicUploadFilename({
                itemNumber,
                fiscalDocNumber: fiscalNumber,
                supplierName,
              }),
            }
          : item,
      ),
    );
  }

  function openPreviewOne(row: ReservationRow) {
    const item = rowToPreviewItem(row);
    if (!item) return;
    setPreviewItems([item]);
    setPreviewMode("one");
  }

  function openPreviewAll() {
    const items = uploadableRows
      .map(rowToPreviewItem)
      .filter((item): item is SalicUploadPreviewItem => item !== null);
    if (items.length === 0) return;
    setPreviewItems(items);
    setPreviewMode("all");
  }

  function closePreview() {
    if (busy) return;
    setPreviewItems([]);
    setPreviewMode(null);
  }

  function confirmUpload(justificativas: Record<string, string>) {
    setError(null);
    setMessage(null);
    start(async () => {
      const result =
        previewMode === "all"
          ? await publishAllCommitmentsToSalic(planningProjectId, {
              justificativasByProofId: justificativas,
            })
          : previewItems[0]
            ? await publishCommitmentToSalic(
                planningProjectId,
                previewItems[0].commitmentId,
                {
                  justificativa: justificativas[previewItems[0].proofId] ?? "",
                },
              )
            : { error: "Nenhuma reserva selecionada." };

      if (result.error) {
        setError(result.error);
        return;
      }
      setPreviewItems([]);
      setPreviewMode(null);
      setMessage(result.message || "Enviado ao SALIC.");
      router.refresh();
    });
  }

  function confirmMarkRemovedLocally() {
    if (!confirmRemoveProofId) return;
    const proofId = confirmRemoveProofId;
    setError(null);
    setMessage(null);
    start(async () => {
      const result = await markSalicProofRemovedLocally(planningProjectId, proofId);
      setConfirmRemoveProofId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message || "Pronto para reenviar ao SALIC.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {showSalicTools ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--gray-50)] px-4 py-3">
          <p className="text-sm text-[var(--gray-600)]">
            {rows.length === 0
              ? "Use Conferir SALIC para ver pagamentos já registrados no portal, mesmo sem reservas locais."
              : "Envie comprovantes (e NF/RPA unificados) direto ao SALIC por reserva. Use Conferir SALIC para sincronizar com o portal."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => runReconcile()}
            >
              {reconciling ? "Conferindo…" : "Conferir SALIC"}
            </button>
            {rows.length > 0 ? (
              <button
                type="button"
                className="btn"
                disabled={busy || uploadableCount === 0}
                onClick={openPreviewAll}
              >
                {pending ? "Enviando…" : `Subir todas (${uploadableCount})`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      {salicItems.length > 0 ? <SalicPaymentsPanel items={salicItems} /> : null}

      {rows.length === 0 ? (
        <div className="card px-5 py-12 text-center text-sm text-[var(--gray-500)]">
          Nenhuma reserva local ainda. Use{" "}
          <Link
            href={`/planejamento/${planningProjectId}/nf/nova`}
            className="text-[var(--gold)] hover:underline"
          >
            Subir NF/RPA
          </Link>{" "}
          para criar reservas a partir de notas fiscais.
          {showSalicTools && !reconciling && salicItems.length === 0 ? (
            <>
              {" "}
              Ou clique em <strong>Conferir SALIC</strong> para buscar o que já está no portal.
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <div
              key={c.id}
              className={`card flex flex-wrap items-center justify-between gap-4 p-5 ${
                c.nfPending ? "border-red-200 bg-red-50/40" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="font-semibold text-[var(--navy)]">
                  {commitmentStatusLabel(c.status)} ·{" "}
                  <span className="tabular-nums">{formatCurrency(c.amount)}</span>
                  {c.nfPending ? (
                    <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                      {nfPendingBadge()}
                    </span>
                  ) : null}
                  {c.salic.uploaded ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      No SALIC
                      {c.salic.publishMode === "MERGED" ? " (NF+comp.)" : ""}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-sm text-[var(--gray-500)]">
                  {c.supplierName} · {c.serviceName}
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--gray-400)]">
                  {formatRubricShortLabel(c.budgetLine)} · {c.budgetLine.stageName}
                  {" · "}
                  {formatDate(c.createdAt)}
                  {c.paidAt ? ` · pago ${formatDate(c.paidAt)}` : ""}
                </p>
                {c.salic.reason && !c.salic.canUpload ? (
                  <p className="mt-1 text-xs text-amber-800">{c.salic.reason}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {showSalicTools && c.salic.canUpload ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => openPreviewOne(c)}
                  >
                    {pending ? "Enviando…" : "Subir ao SALIC"}
                  </button>
                ) : null}
                {showSalicTools && c.salic.uploaded && c.salic.proofId ? (
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={busy}
                    onClick={() => setConfirmRemoveProofId(c.salic.proofId)}
                  >
                    Removido no SALIC
                  </button>
                ) : null}
                {c.nfPending ? (
                  <Link
                    href={`/planejamento/compromissos/${c.id}/anexar-nf`}
                    className="btn"
                  >
                    Anexar NF
                  </Link>
                ) : c.status === "RESERVED" ? (
                  <Link href={`/planejamento/compromissos/${c.id}`} className="btn">
                    Subir comprovante
                  </Link>
                ) : (
                  <Link
                    href={`/planejamento/compromissos/${c.id}`}
                    className="btn btn-ghost"
                  >
                    Abrir
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <SalicUploadPreviewModal
        open={previewItems.length > 0}
        items={previewItems}
        pending={pending}
        onCancel={closePreview}
        onConfirm={confirmUpload}
        onFiscalNumberUpdated={handleFiscalNumberUpdated}
      />

      <ConfirmDialog
        open={Boolean(confirmRemoveProofId)}
        title="Removido manualmente no SALIC?"
        description="Use isto se o comprovante foi apagado direto no portal do SALIC. O MAX Origem vai liberar o reenvio desta reserva."
        confirmLabel="Sim, liberar reenvio"
        pending={pending}
        onCancel={() => setConfirmRemoveProofId(null)}
        onConfirm={confirmMarkRemovedLocally}
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
