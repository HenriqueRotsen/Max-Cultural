import type { ReactNode } from "react";
import { FieldHelp } from "@/components/FieldHelp";

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
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
