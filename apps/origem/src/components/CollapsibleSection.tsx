"use client";

import { useState, type ReactNode } from "react";

export function CollapsibleSection({
  title,
  summary,
  children,
  defaultOpen = false,
  expandLabel = "Expandir",
  collapseLabel = "Recolher",
  className = "card p-5",
}: {
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  expandLabel?: string;
  collapseLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-[var(--navy)]">{title}</h2>
          {summary ? (
            <p className="mt-1 text-sm text-[var(--gray-500)]">{summary}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? collapseLabel : expandLabel}
        </button>
      </div>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
