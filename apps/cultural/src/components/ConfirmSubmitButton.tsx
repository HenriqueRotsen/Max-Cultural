"use client";

import { useEffect, useRef, useState } from "react";

export function ConfirmSubmitButton({
  message,
  children,
  className,
  title = "Confirmar",
  confirmLabel = "Confirmar",
  disabled,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  confirmLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Enter") e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={submitRef}
        type="submit"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
      />
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg">
            <h2 className="text-base font-semibold text-[var(--navy)]">{title}</h2>
            <p className="mt-2 max-h-40 overflow-y-auto text-sm leading-relaxed break-words text-[var(--gray-600)]">
              {message}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setOpen(false);
                  submitRef.current?.click();
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
