import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { SupplierAgencyControl } from "@/components/SupplierAgencyControl";
import { formatCgccpf, formatCurrency, normalizeCgccpf } from "@/lib/format";
import { excludeProjects, hiddenProjectIds } from "@/lib/compliance/over-limit-visibility";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Sem acento e minúsculo, para a busca por nome. */
const plain = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Auditoria › Agências — fornecedores intermediários: só um percentual do que
 * foi pago a eles conta nos limites. Mesmo cadastro do MAX Financeiro.
 */
export default async function AgenciasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const projectScope = {
    salicAccount: { workspaceId: ws },
    ...excludeProjects(await hiddenProjectIds()),
  };

  const [agencies, suppliers, paymentAggs] = await Promise.all([
    prisma.supplierAgency.findMany({
      where: { workspaceId: ws },
      select: { cnpj: true, pct: true, updatedAt: true },
    }),
    prisma.supplier.findMany({
      where: { payments: { some: { project: projectScope } } },
      select: { id: true, name: true, cgccpf: true },
      orderBy: { name: "asc" },
    }),
    prisma.payment.groupBy({
      by: ["supplierId"],
      where: { project: projectScope },
      _sum: { amount: true },
    }),
  ]);

  const paidBySupplier = new Map(paymentAggs.map((a) => [a.supplierId, Number(a._sum.amount || 0)]));
  const supplierByDoc = new Map(suppliers.map((s) => [normalizeCgccpf(s.cgccpf), s]));
  const pctByDoc = new Map(agencies.map((a) => [a.cnpj, Number(a.pct)]));

  const rows = agencies
    .map((a) => {
      const s = supplierByDoc.get(a.cnpj);
      const pct = Number(a.pct);
      const paid = s ? (paidBySupplier.get(s.id) ?? 0) : 0;
      return {
        cnpj: a.cnpj,
        pct,
        supplierId: s?.id ?? null,
        name: s?.name ?? null,
        paid,
        counted: (paid * pct) / 100,
      };
    })
    .sort((x, y) => (x.name ?? x.cnpj).localeCompare(y.name ?? y.cnpj, "pt-BR"));

  const qDigits = normalizeCgccpf(q);
  const qPlain = plain(q);
  const results =
    q.length >= 2
      ? suppliers
          .filter((s) => {
            const doc = normalizeCgccpf(s.cgccpf);
            if (pctByDoc.has(doc)) return false;
            return (
              plain(s.name).includes(qPlain) || (qDigits.length >= 3 && doc.includes(qDigits))
            );
          })
          .slice(0, 15)
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Auditoria › Agências"
        title="Agências"
        description="Fornecedores que só intermedeiam o pagamento. Deles, só o percentual informado do que foi pago conta nos limites de fornecedor e de vínculo, aqui e no MAX Financeiro."
      />

      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--navy)]">
            Agências cadastradas{rows.length ? ` (${rows.length})` : ""}
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--gray-500)]">
            Nenhuma agência ainda. Busque o fornecedor abaixo para marcar.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <li key={r.cnpj} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  {r.supplierId ? (
                    <Link
                      href={`/panorama/${r.supplierId}`}
                      className="font-semibold text-[var(--navy)] hover:underline"
                    >
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-[var(--navy)]">
                      {r.name ?? "Sem pagamento nos PRONACs carregados"}
                    </span>
                  )}
                  <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                    {formatCgccpf(r.cnpj)}
                    {r.paid > 0 ? (
                      <>
                        <span className="mx-1.5 text-[var(--gray-300)]">·</span>
                        pago {formatCurrency(r.paid)} · conta {formatCurrency(r.counted)}
                      </>
                    ) : null}
                  </p>
                </div>
                <SupplierAgencyControl cgccpf={r.cnpj} agencyPct={r.pct} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--navy)]">Marcar agência</h2>
          <p className="mt-1 text-[0.95rem] text-[var(--gray-600)]">
            Busque entre os fornecedores pagos por nome ou CNPJ.
          </p>
        </div>
        <div className="space-y-4 p-5">
          <form action="/agencias" className="flex max-w-xl gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Nome ou CNPJ do fornecedor"
              className="flex-1"
              aria-label="Buscar fornecedor"
            />
            <button type="submit" className="btn">
              Buscar
            </button>
          </form>
          {q.length >= 2 ? (
            results.length === 0 ? (
              <p className="text-sm text-[var(--gray-500)]">
                Nenhum fornecedor pago encontrado para “{q}”.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                {results.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--navy)]">{s.name}</p>
                      <p className="text-sm text-[var(--gray-500)]">
                        {formatCgccpf(s.cgccpf)} · pago {formatCurrency(paidBySupplier.get(s.id) ?? 0)}
                      </p>
                    </div>
                    <SupplierAgencyControl cgccpf={s.cgccpf} agencyPct={null} />
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </section>
    </div>
  );
}
