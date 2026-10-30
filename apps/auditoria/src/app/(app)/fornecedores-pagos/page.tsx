import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, StatCard } from "@/components/ui";
import { FieldHelp } from "@/components/FieldHelp";
import { SyncedSuppliersTable } from "@/components/SyncedSuppliersTable";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Auditoria › Fornecedores — todos que já receberam pagamento nos PRONACs
 * carregados do SALIC (antiga aba "Todos no Salink").
 */
export default async function AuditoriaFornecedoresPage() {
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const projectScope = { salicAccount: { workspaceId: ws } };

  const [suppliers, paymentAggs, watched] = await Promise.all([
    prisma.supplier.findMany({
      where: { payments: { some: { project: projectScope } } },
      orderBy: { name: "asc" },
    }),
    prisma.payment.groupBy({
      by: ["supplierId"],
      where: { project: projectScope },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.watchedSupplier.findMany({
      where: { workspaceId: ws },
      select: { supplierId: true, cgccpf: true },
    }),
  ]);

  const aggBySupplier = new Map(
    paymentAggs.map((a) => [
      a.supplierId,
      { total: Number(a._sum.amount || 0), payments: a._count._all },
    ]),
  );

  const watchedIds = new Set(watched.map((w) => w.supplierId).filter(Boolean) as string[]);
  const watchedDocs = new Set(
    watched.map((w) => (w.cgccpf || "").replace(/\D/g, "")).filter(Boolean),
  );

  const supplierRows = suppliers.map((s) => {
    const agg = aggBySupplier.get(s.id);
    return {
      id: s.id,
      name: s.name,
      cgccpf: s.cgccpf,
      payments: agg?.payments ?? 0,
      total: agg?.total ?? 0,
      watched:
        watchedIds.has(s.id) || watchedDocs.has((s.cgccpf || "").replace(/\D/g, "")),
    };
  });

  const totalPaid = supplierRows.reduce((sum, s) => sum + s.total, 0);
  const totalPayments = supplierRows.reduce((sum, s) => sum + s.payments, 0);
  const watchedCount = supplierRows.filter((s) => s.watched).length;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Auditoria › Fornecedores"
        title="Fornecedores pagos"
        description="Todos que já receberam dinheiro nos projetos carregados do SALIC. Clique em um nome para ver os pagamentos dele em cada PRONAC."
        actions={
          <>
            <Link href="/observados?tab=adicionar" className="btn">
              Adicionar observado
            </Link>
            <Link href="/observados" className="btn btn-ghost">
              Ver observados
            </Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Fornecedores pagos"
          value={String(supplierRows.length)}
          hint={`${totalPayments} pagamentos no total`}
          help="Quantidade de CNPJs/CPFs diferentes que aparecem na relação de pagamentos dos PRONACs já carregados."
        />
        <StatCard
          label="Total pago"
          value={formatCurrency(totalPaid)}
          hint={
            supplierRows.length > 0
              ? `Média de ${formatCurrency(totalPaid / supplierRows.length)} por fornecedor`
              : "Nenhum pagamento carregado"
          }
          help="Soma de todos os pagamentos comprovados no SALIC para esses fornecedores, em todos os projetos das suas contas."
        />
        <StatCard
          label="Observados nesta lista"
          value={String(watchedCount)}
          hint="Marcados para acompanhamento de vínculos"
          help="Fornecedores desta lista que também estão na sua lista de Observados (usada na análise de vínculos do art. 23)."
        />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--navy)]">
            Todos os fornecedores pagos
            <FieldHelp text="Esta lista é montada automaticamente a partir dos pagamentos do SALIC. Ela não é a lista de observados — use a tela Observados para acompanhar alguém de perto." />
          </h2>
          <p className="mt-1 text-[0.95rem] text-[var(--gray-600)]">
            Busque por nome ou CNPJ/CPF e ordene clicando no título das colunas.
          </p>
        </div>
        <div className="p-5">
          <SyncedSuppliersTable suppliers={supplierRows} />
        </div>
      </section>
    </div>
  );
}
