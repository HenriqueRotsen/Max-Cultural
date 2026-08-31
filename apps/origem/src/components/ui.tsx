import type { ReactNode } from "react";
import Link from "next/link";
import { FieldHelp } from "@/components/FieldHelp";

export function PageBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex text-sm text-[var(--gray-500)] transition hover:text-[var(--navy)]"
    >
      ← {label}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  backHref,
  backLabel = "Voltar",
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {backHref ? (
          <div className="mb-2">
            <PageBackLink href={backHref} label={backLabel} />
          </div>
        ) : null}
        {breadcrumb && (
          <p className="mb-1 text-xs font-medium text-[var(--gray-400)]">{breadcrumb}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--navy)]">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-[var(--gray-500)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  help,
}: {
  label: string;
  value: string;
  hint?: string;
  help?: string;
}) {
  return (
    <div className="card p-5">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
        {label}
        {help ? <FieldHelp text={help} /> : null}
      </p>
      <p className="mt-3 text-2xl font-semibold text-[var(--navy)]">{value}</p>
      {hint && <p className="mt-2 text-xs text-[var(--gray-500)]">{hint}</p>}
    </div>
  );
}
