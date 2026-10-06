"use client";

import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export function IconConfirmButton({
  message,
  title,
  confirmLabel,
  label,
  children,
}: {
  message: string;
  title?: string;
  confirmLabel?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <ConfirmSubmitButton
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--navy)] transition hover:bg-[var(--navy-soft)]"
      message={message}
      title={title ?? label}
      tooltip={label}
      confirmLabel={confirmLabel}
    >
      <span className="sr-only">{label}</span>
      {children}
    </ConfirmSubmitButton>
  );
}

/** Chave + setas de reset (redefinir senha). */
export function IconKeyReset() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* Cabeça da chave */}
      <circle
        cx="8"
        cy="10"
        r="3.25"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      {/* Haste + dentes */}
      <path
        d="M11 10h8.5M16.5 10v2.25M19 10v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arco de reset */}
      <path
        d="M5.2 16.2a5.2 5.2 0 0 0 8.3 1.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M13.8 15.2v2.6h-2.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 7V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2M3 12h11m0 0-3-3m3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPower() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v8m5.66-5.66A8 8 0 1 1 6.34 5.34"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
