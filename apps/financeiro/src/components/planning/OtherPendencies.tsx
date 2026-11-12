import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ExtractedTaxes } from "@/lib/nf/extract";
import { taxDueSummaryFromCompetence } from "@/lib/planning/tax-due-dates";

const LIMIT = 8;

type Item = {
  key: string;
  href: string;
  title: string;
  detail: string;
  amount: number;
  date: Date | null;
  late: boolean;
};

function List({ title, hint, items }: { title: string; hint: string; items: Item[] }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, LIMIT);
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
      {items.length > LIMIT ? (
        <p className="text-xs text-[var(--gray-500)]">
          E mais {items.length - LIMIT}. Veja em cada projeto.
        </p>
      ) : null}
    </section>
  );
}

/**
 * O que ainda falta além de pagar reservas: pagamentos feitos sem NF/RPA e
 * impostos retidos sem guia anexada. Só aparece quando há algo.
 */
export async function OtherPendencies({ workspaceId }: { workspaceId: string }) {
  const now = new Date();

  const [paidWithoutNf, docsWithTaxes] = await Promise.all([
    prisma.rubricCommitment.findMany({
      where: {
        workspaceId,
        status: "PAID",
        nfPending: true,
        planningProject: { closedAt: null },
      },
      include: {
        planningProject: { select: { externalCode: true } },
        engagement: { select: { service: { select: { supplier: { select: { name: true } } } } } },
      },
      orderBy: { paidAt: "asc" },
    }),
    prisma.planningDocument.findMany({
      where: {
        workspaceId,
        kind: { in: ["NF", "RPA"] },
        status: "IMPORTED",
        taxTotal: { gt: 0 },
        planningProject: { closedAt: null },
        // Guia ligada à nota, ou anexada ao pagamento antes de a nota chegar.
        derivedProofs: { none: { kind: "TAX_PROOF" } },
        OR: [
          { commitmentId: null },
          { commitment: { documents: { none: { kind: "TAX_PROOF" } } } },
        ],
      },
      select: {
        id: true,
        kind: true,
        commitmentId: true,
        taxTotal: true,
        taxesJson: true,
        extractedJson: true,
        createdAt: true,
        planningProject: { select: { externalCode: true } },
        engagement: { select: { hiredAt: true } },
      },
    }),
  ]);

  const nfItems: Item[] = paidWithoutNf.map((c) => ({
    key: c.id,
    href: `/planejamento/compromissos/${c.id}/anexar-nf`,
    title: c.engagement.service.supplier.name,
    detail: `${c.planningProject.externalCode} · pago em ${c.paidAt ? formatDate(c.paidAt) : "—"}`,
    amount: Number(c.amount),
    date: c.nfReminderAt,
    late: Boolean(c.nfReminderAt && c.nfReminderAt < now),
  }));

  const taxItems: Item[] = docsWithTaxes
    .map((d) => {
      const ext = (d.extractedJson || {}) as { supplierName?: string | null; hiredAt?: string | null };
      const competence = ext.hiredAt
        ? new Date(`${ext.hiredAt.slice(0, 10)}T12:00:00Z`)
        : (d.engagement?.hiredAt ?? d.createdAt);
      const due = taxDueSummaryFromCompetence(competence, d.taxesJson as ExtractedTaxes | null);
      const dates = [due.issDue, due.federalDue].filter(Boolean) as Date[];
      const first = dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      return {
        key: d.id,
        href: d.commitmentId ? `/planejamento/compromissos/${d.commitmentId}` : "/planejamento",
        title: ext.supplierName || `${d.kind}`,
        detail: `${d.planningProject?.externalCode ?? ""} · ${d.kind} · guia(s) não anexada(s)`,
        amount: Number(d.taxTotal),
        date: first,
        late: Boolean(first && first < now),
      };
    })
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  if (nfItems.length === 0 && taxItems.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <List
        title="Pagos sem NF/RPA"
        hint="Pagamentos já feitos que ainda esperam a nota. A data é o lembrete combinado."
        items={nfItems}
      />
      <List
        title="Impostos retidos a recolher"
        hint="NF/RPA com retenção e sem guia anexada. A data é o vencimento típico."
        items={taxItems}
      />
    </div>
  );
}
