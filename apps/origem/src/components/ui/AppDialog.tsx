"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

function useEscape(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, enabled]);
}

function DialogShell({
  open,
  onClose,
  children,
  labelledBy,
  role = "dialog",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  role?: "dialog" | "alertdialog";
}) {
  useEscape(onClose, open);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Voltar",
  tone = "default",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = "app-confirm-title";

  return (
    <DialogShell open={open} onClose={onCancel} labelledBy={titleId}>
      <div className="px-5 py-5">
        <h2 id={titleId} className="text-base font-semibold text-[var(--navy)]">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-relaxed text-[var(--gray-600)]">
          {description}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "btn bg-red-700 hover:bg-red-800" : "btn"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

export function AlertDialog({
  open,
  title,
  description,
  tone = "info",
  closeLabel = "Voltar",
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  tone?: "info" | "error" | "success";
  closeLabel?: string;
  onClose: () => void;
}) {
  const titleId = "app-alert-title";
  const toneStyles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-950"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <DialogShell open={open} onClose={onClose} labelledBy={titleId} role="alertdialog">
      <div className={`border-b px-5 py-4 ${toneStyles}`}>
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
      </div>
      <div className="px-5 py-4 text-sm leading-relaxed text-[var(--gray-700)]">
        {description}
      </div>
      <div className="flex justify-end border-t border-[var(--border)] px-5 py-3">
        <button type="button" className="btn" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </DialogShell>
  );
}
