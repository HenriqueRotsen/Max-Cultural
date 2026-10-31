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
  actions,
  backHref,
  backLabel = "Voltar",
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Não exibido: o menu agrupado já mostra onde a pessoa está. */
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 basis-[18rem]">
        {backHref ? (
          <div className="mb-2">
            <PageBackLink href={backHref} label={backLabel} />
          </div>
        ) : null}
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-[var(--navy)]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-base text-[var(--gray-600)]">{description}</p>
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
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--gray-500)]">
        {label}
        {help ? <FieldHelp text={help} /> : null}
      </p>
      <p className="mt-2 whitespace-nowrap text-[clamp(1.15rem,2.1vw,1.6rem)] font-semibold leading-tight text-[var(--navy)]">{value}</p>
      {hint && <p className="mt-2 text-sm text-[var(--gray-500)]">{hint}</p>}
    </div>
  );
}

/**
 * Bloco padrão das telas: número, título, uma frase do que é a parte e o
 * conteúdo separado. `collapsible` usa <details> — começa fechado e abre no clique.
 */
export function Section({
  step,
  title,
  description,
  help,
  actions,
  summary,
  collapsible = false,
  defaultOpen = false,
  tone = "default",
  id,
  children,
}: {
  step?: number | string;
  title: ReactNode;
  description?: ReactNode;
  help?: string;
  actions?: ReactNode;
  /** Resumo curto ao lado do título quando fechado (ex.: "142 pagamentos"). */
  summary?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  tone?: "default" | "highlight";
  id?: string;
  children?: ReactNode;
}) {
  const heading = (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {step != null ? (
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-sm font-semibold text-white"
          aria-hidden
        >
          {step}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="inline-flex flex-wrap items-center gap-2 text-lg font-semibold leading-snug text-[var(--navy)]">
          {title}
          {help ? <FieldHelp text={help} /> : null}
          {summary ? (
            <span className="text-sm font-medium text-[var(--gray-500)]">· {summary}</span>
          ) : null}
        </h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-[0.95rem] leading-relaxed text-[var(--gray-600)]">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
  const shell = `card section-block overflow-hidden${tone === "highlight" ? " section-block-highlight" : ""}`;

  if (collapsible) {
    return (
      <details id={id} className={`${shell} section-collapsible`} open={defaultOpen || undefined}>
        <summary className="section-head flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 px-5 py-4">
          {heading}
          <span className="section-toggle btn btn-ghost pointer-events-none" aria-hidden>
            <span className="section-toggle-open">Mostrar</span>
            <span className="section-toggle-close">Esconder</span>
          </span>
        </summary>
        <div className="border-t border-[var(--border)] p-5">{children}</div>
      </details>
    );
  }

  return (
    <section id={id} className={shell}>
      <div className="section-head flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        {heading}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children != null ? (
        <div className="border-t border-[var(--border)] p-5">{children}</div>
      ) : null}
    </section>
  );
}

/** Resposta principal da tela em uma frase, com cor (ok / atenção / problema). */
export function StatusBanner({
  tone,
  title,
  children,
}: {
  tone: "ok" | "attention" | "critical" | "neutral";
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`status-banner status-banner-${tone}`} role="status">
      <span className="status-banner-dot" aria-hidden />
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-snug">{title}</p>
        {children ? <div className="mt-1 text-[0.95rem] leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
