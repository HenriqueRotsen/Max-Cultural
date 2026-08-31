"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/format";
import { EditFiscalNumberForm } from "@/components/planning/EditFiscalNumberForm";

export type SalicUploadPreviewItem = {
  commitmentId: string;
  proofId: string;
  title: string;
  subtitle: string;
  amount: number;
  publishMode: "MERGED" | "PROOF_ONLY" | null;
  uploadFilename: string | null;
  fiscalDocumentId: string | null;
  fiscalKind: "NF" | "RPA" | null;
  fiscalNumber: string | null;
  itemNumber: number | null;
  supplierName: string;
};

export function SalicUploadPreviewModal({
  open,
  items,
  pending = false,
  onCancel,
  onConfirm,
  onFiscalNumberUpdated,
}: {
  open: boolean;
  items: SalicUploadPreviewItem[];
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (justificativas: Record<string, string>) => void;
  onFiscalNumberUpdated?: (
    proofId: string,
    fiscalNumber: string,
    itemNumber: number | null,
    supplierName: string,
  ) => void;
}) {
  const [index, setIndex] = useState(0);
  const [justificativas, setJustificativas] = useState<Record<string, string>>({});
  const carousel = items.length > 1;
  const current = items[index] ?? null;

  useEffect(() => {
    if (open) {
      setIndex(0);
      setJustificativas({});
    }
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (!carousel) return;
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(items.length - 1, i + 1));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, carousel, items.length, onCancel]);

  if (!open || typeof document === "undefined" || !current) return null;

  const modeLabel =
    current.publishMode === "MERGED"
      ? "PDF unificado (NF + comprovante)"
      : "Somente comprovante";

  const filenameLabel = current.uploadFilename
    ? `Arquivo no SALIC: ${current.uploadFilename}`
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="salic-preview-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 id="salic-preview-title" className="text-base font-semibold text-[var(--navy)]">
            {carousel ? "Revisar comprovantes antes do envio" : "Revisar arquivo antes do envio"}
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-600)]">
            Confira o PDF que será enviado ao SALIC.{" "}
            {carousel
              ? `${items.length} reserva(s) pronta(s) — use as setas para navegar.`
              : modeLabel}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--gray-100)] p-3">
            <iframe
              key={current.proofId}
              title={`Preview ${current.title}`}
              src={`/api/planning/salic-preview/${current.proofId}`}
              className="min-h-[240px] w-full flex-1 rounded-lg border border-[var(--border)] bg-white md:min-h-[320px]"
            />
            {carousel ? (
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {items.map((item, i) => (
                  <button
                    key={item.proofId}
                    type="button"
                    disabled={pending}
                    onClick={() => setIndex(i)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      i === index
                        ? "bg-[var(--navy)] text-white"
                        : "bg-white text-[var(--gray-700)] ring-1 ring-[var(--border)] hover:bg-[var(--gray-50)]"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="flex w-full shrink-0 flex-col border-t border-[var(--border)] bg-white md:w-[min(100%,22rem)] md:border-l md:border-t-0">
            <div className="space-y-4 overflow-y-auto p-4">
              <div className="space-y-1">
                <p className="font-medium text-[var(--navy)]">{current.title}</p>
                <p className="text-sm text-[var(--gray-500)]">{current.subtitle}</p>
                <p className="text-xs text-[var(--gray-400)]">
                  {formatCurrency(current.amount)} · {modeLabel}
                </p>
                {filenameLabel ? (
                  <p className="break-all font-mono text-xs text-[var(--navy)]">
                    {filenameLabel}
                  </p>
                ) : null}
              </div>

              {carousel ? (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--gray-50)] px-3 py-2">
                  <button
                    type="button"
                    className="btn btn-ghost px-2"
                    disabled={index === 0 || pending}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    aria-label="Comprovante anterior"
                  >
                    ←
                  </button>
                  <span className="text-center text-sm tabular-nums text-[var(--gray-600)]">
                    {index + 1} de {items.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost px-2"
                    disabled={index >= items.length - 1 || pending}
                    onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
                    aria-label="Próximo comprovante"
                  >
                    →
                  </button>
                </div>
              ) : null}

              {current.fiscalDocumentId && current.fiscalKind ? (
                <EditFiscalNumberForm
                  documentId={current.fiscalDocumentId}
                  kind={current.fiscalKind}
                  currentNumber={current.fiscalNumber}
                  compact
                  onUpdated={(fiscalNumber) =>
                    onFiscalNumberUpdated?.(
                      current.proofId,
                      fiscalNumber,
                      current.itemNumber,
                      current.supplierName,
                    )
                  }
                />
              ) : null}

              <label className="field">
                <span>
                  Justificativa do proponente
                  {carousel ? (
                    <span className="ml-1 font-normal text-[var(--gray-500)]">
                      (deste comprovante)
                    </span>
                  ) : null}
                </span>
                <textarea
                  rows={3}
                  className="w-full"
                  placeholder="Opcional — texto enviado ao SALIC junto com o comprovante"
                  value={justificativas[current.proofId] ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    setJustificativas((prev) => ({
                      ...prev,
                      [current.proofId]: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </aside>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>
            Voltar
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => onConfirm(justificativas)}
          >
            {pending
              ? "Enviando…"
              : carousel
                ? `Confirmar envio de ${items.length}`
                : "Confirmar envio ao SALIC"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
