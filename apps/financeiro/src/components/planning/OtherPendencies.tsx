import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { loadFinancialPendencias, type PendenciaItem } from "@/lib/planning/financial-pendencias";

const LIMIT = 8;

type Item = PendenciaItem;

export function List({
  title,
  hint,
  items,
  limit = LIMIT,
}: {
  title: string;
  hint: string;
  items: Item[];
  /** Quantos mostrar (o Contas a pagar mostra poucos; a aba do projeto, todos). */
  limit?: number;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, limit);
  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-semibold text-[var(--navy)]">
          {title} <span className="text-[var(--gray-400)]">· {items.length}</span>
        </h2>
        <p className="text-xs text-[var(--gray-500)]">{hint}</p>
      </div>
      <ul className="divide-y divide-[var(--border)] text-sm">
        {shown.map((i) => (
          <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link href={i.href} className="min-w-0 flex-1 hover:underline">
              <span className="font-medium text-[var(--navy)]">{i.title}</span>{" "}
              <span className="text-[var(--gray-500)]">· {i.detail}</span>
            </Link>
            <span className="flex items-center gap-3 tabular-nums">
              {i.date ? (
                <span className={i.late ? "font-semibold text-red-700" : "text-[var(--gray-500)]"}>
                  {formatDate(i.date)}
                </span>
              ) : null}
              <span className="font-semibold">{formatCurrency(i.amount)}</span>
            </span>
          </li>
        ))}
      </ul>
      {items.length > limit ? (
        <p className="text-xs text-[var(--gray-500)]">
          E mais {items.length - limit}. Veja em cada projeto.
        </p>
      ) : null}
    </section>
  );
}

/**
 * O que ainda falta além de pagar reservas: pagamentos feitos sem NF/RPA e
 * impostos retidos sem guia anexada. Só aparece quando há algo. Mesma conta
 * da aba Pendências de cada projeto.
 */
export async function OtherPendencies({ workspaceId }: { workspaceId: string }) {
  const { pagosSemNf, impostos } = await loadFinancialPendencias({ workspaceId });
  if (pagosSemNf.length === 0 && impostos.length === 0) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <List
        title="Pagos sem NF/RPA"
        hint="Pagamentos já feitos que ainda esperam a nota. A data é o lembrete combinado."
        items={pagosSemNf}
      />
      <List
        title="Impostos retidos a recolher"
        hint="NF/RPA com retenção e sem guia anexada. A data é o vencimento típico."
        items={impostos}
      />
    </div>
  );
}
