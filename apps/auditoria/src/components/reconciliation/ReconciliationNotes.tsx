import { formatCurrency, formatDate } from "@/lib/format";
import { STAGE_LABEL, type ProjectReconciliation, type ReconciliationNote } from "@/lib/reconciliation";

const TONE: Record<ReconciliationNote["level"], string> = {
  critical: "border-[#f2c7c7] bg-[#fdecec]",
  attention: "border-[var(--gold-border)] bg-[var(--gold-soft)]",
  info: "border-[var(--border)] bg-[var(--navy-soft)]",
};

const pctText = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Avisos de captado × pago de um projeto (na própria tela, não na aba Alertas). */
export function ReconciliationNotes({ r, compact = false }: { r: ProjectReconciliation; compact?: boolean }) {
  if (!r.notes.length) {
    return compact ? null : (
      <p className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm text-[var(--gray-600)]">
        Pago e captado batem.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {r.notes.map((n) => (
        <div key={n.code} className={`rounded-xl border px-4 py-3 text-sm text-[var(--navy)] ${TONE[n.level]}`}>
          <p className="font-semibold">{n.title}</p>
          {!compact ? <p className="mt-1 text-[var(--gray-600)]">{n.detail}</p> : null}
          {n.code === "DUPLICADO" && r.duplicates.length ? (
            <details className="group mt-2">
              <summary className="cursor-pointer text-xs font-medium hover:underline">
                <span className="group-open:hidden">Ver os comprovantes repetidos</span>
                <span className="hidden group-open:inline">Recolher</span>
              </summary>
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--gray-600)]">
                {r.duplicates.map((d, i) => (
                  <li key={i}>
                    {d.supplierName} · {d.documentNumber || "sem nº"} · {formatCurrency(d.amount)} · {d.times}×
                    {d.itemName ? ` · ${d.itemName}` : ""}
                    {d.paymentDate ? ` · ${formatDate(d.paymentDate)}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Bloco "Captado × pago" do PRONAC. */
export function ReconciliationCard({ r }: { r: ProjectReconciliation }) {
  return (
    <section className="card space-y-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-[var(--navy)]">Captado × pago</h2>
        <span className="badge badge-muted">{STAGE_LABEL[r.stage]}</span>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[var(--gray-500)]">Captado</dt>
          <dd className="font-semibold text-[var(--navy)]">{formatCurrency(r.captado)}</dd>
        </div>
        <div>
          <dt className="text-[var(--gray-500)]">Pago</dt>
          <dd className="font-semibold text-[var(--navy)]">{formatCurrency(r.pago)}</dd>
        </div>
        <div>
          <dt className="text-[var(--gray-500)]">Diferença</dt>
          <dd className="font-semibold text-[var(--navy)]">
            {formatCurrency(r.diff)}
            {r.pct != null ? <span className="ml-1 font-normal text-[var(--gray-500)]">({pctText(r.pct)})</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--gray-500)]">Teto de rendimento</dt>
          <dd className="font-semibold text-[var(--navy)]">
            {r.rendimentoTeto != null ? formatCurrency(r.rendimentoTeto) : "—"}
            {r.months != null ? (
              <span className="ml-1 font-normal text-[var(--gray-500)]">({Math.round(r.months)} meses a 1%)</span>
            ) : null}
          </dd>
        </div>
      </dl>
      <ReconciliationNotes r={r} />
      <p className="text-xs text-[var(--gray-500)]">
        O SALIC não mostra os rendimentos da conta do projeto nem transferências entre projetos. O teto usa 1% ao mês
        sobre o captado, do primeiro aporte ao último pagamento, como limite do que rendimentos explicariam.
      </p>
    </section>
  );
}
