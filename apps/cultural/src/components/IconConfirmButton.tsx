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
      confirmLabel={confirmLabel}
    >
      <span className="sr-only">{label}</span>
      {children}
    </ConfirmSubmitButton>
  );
}

export function IconKey() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 7a4 4 0 1 1-4 4m4-4a4 4 0 0 0-4 4m4-4 6.5 6.5M17 15l2 2m-6.5-2.5L8 10m0 0H5.5L3 12.5 5.5 15H8l2.5-2.5"
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
