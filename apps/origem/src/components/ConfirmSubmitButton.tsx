"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  message: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  confirmLabel?: string;
};

/** Botão submit que pede confirmação (clique) antes de enviar. Enter no diálogo não confirma. */
export function ConfirmSubmitButton({
  message,
  children,
  className,
  disabled,
  title = "Confirmar",
  confirmLabel = "Confirmar",
}: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open ? (
        <ConfirmOverlay
          title={title}
          description={message}
          confirmLabel={confirmLabel}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            const form = btnRef.current?.closest("form");
            setOpen(false);
            form?.requestSubmit();
          }}
        />
      ) : null}
    </>
  );
}

function ConfirmOverlay({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
        <h2 id="confirm-title" className="text-base font-semibold text-[var(--navy)]">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--gray-600)]">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Voltar
          </button>
          <button type="button" className="btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
