import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import { getCategoryLabel } from "@/lib/catalog/categories";

export const dynamic = "force-dynamic";

export default async function CatalogDashboardPage() {
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;

  const [suppliers, services, engagements, spend, delayed, recent, monthly, byCategory] =
    await Promise.all([
      prisma.catalogSupplier.count({ where: { workspaceId: ws } }),
      prisma.catalogService.count({ where: { supplier: { workspaceId: ws } } }),
      prisma.catalogEngagement.count({ where: { workspaceId: ws } }),
      prisma.catalogEngagement.aggregate({
        where: { workspaceId: ws },
        _avg: { price: true },
        _sum: { price: true },
      }),
      prisma.catalogEngagement.count({ where: { workspaceId: ws, delayed: true } }),
      prisma.catalogEngagement.findMany({
        where: { workspaceId: ws },
        orderBy: { hiredAt: "desc" },
        take: 8,
        include: { service: { include: { supplier: true } } },
      }),
      prisma.$queryRaw<Array<{ month: string; total_spend: number; count: bigint }>>`
        SELECT to_char(date_trunc('month', e."hiredAt"), 'YYYY-MM') as month,
               COALESCE(SUM(e.price), 0)::float as total_spend,
               COUNT(*)::bigint as count
        FROM catalog_engagements e
        WHERE e."workspaceId" = ${ws}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ category: string; total: bigint; avg_price: number }>>`
        SELECT COALESCE(sp.category, 'outros') as category,
               COUNT(*)::bigint as total,
               AVG(e.price)::float as avg_price
        FROM catalog_engagements e
        JOIN catalog_services sp ON sp.id = e."serviceId"
        JOIN catalog_suppliers s ON s.id = sp."supplierId"
        WHERE e."workspaceId" = ${ws}
        GROUP BY 1
        ORDER BY total DESC
        LIMIT 5
      `,
    ]);

  const totalSpend = Number(spend._sum.price ?? 0);
  const avg = Number(spend._avg.price ?? 0);
  const delayRate = engagements > 0 ? (delayed / engagements) * 100 : 0;
  const maxCat = Math.max(...byCategory.map((c) => Number(c.total)), 1);
  const maxMonth = Math.max(...monthly.map((m) => m.total_spend), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores › Dashboard"
        title="Banco de preços"
        description="Cadastre fornecedores, serviços e contratações. Os comprovantes da Auditoria entram automaticamente como histórico de preços."
        actions={
          <>
            <Link href="/fornecedores/empresas/novo" className="btn">
              Novo fornecedor
            </Link>
            <Link href="/fornecedores/mapa" className="btn btn-ghost">
              Mapa
            </Link>
            <Link href="/fornecedores/contratacoes/novo" className="btn btn-ghost">
              Nova contratação
            </Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Gasto total"
          value={formatCurrency(totalSpend)}
          hint={`${engagements} contratações`}
        />
        <StatCard label="Custo médio" value={formatCurrency(avg)} hint="por contratação" />
        <StatCard
          label="Fornecedores"
          value={String(suppliers)}
          hint={`${services} serviços cadastrados`}
        />
        <StatCard
          label="Taxa de atraso"
          value={`${delayRate.toFixed(0)}%`}
          hint={`${delayed} com atraso`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-[var(--navy)]">Gastos por mês</h2>
          {monthly.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--gray-500)]">Sem contratações ainda.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {monthly.map((m) => (
                <li key={m.month}>
                  <div className="mb-1 flex justify-between text-xs text-[var(--gray-500)]">
                    <span>{m.month}</span>
                    <span>
                      {formatCurrency(m.total_spend)} · {Number(m.count)}x
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--gray-50)]">
                    <div
                      className="h-full rounded-full bg-[var(--navy)]"
                      style={{ width: `${Math.max(6, (m.total_spend / maxMonth) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--navy)]">Por categoria</h2>
          {byCategory.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--gray-500)]">Sem dados.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {byCategory.map((row) => (
                <li key={row.category}>
                  <div className="mb-1 flex justify-between text-xs text-[var(--gray-500)]">
                    <span>{getCategoryLabel(row.category)}</span>
                    <span>{Number(row.total)}x</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--gray-50)]">
                    <div
                      className="h-full rounded-full bg-[var(--gold)]"
                      style={{ width: `${Math.max(6, (Number(row.total) / maxCat) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--navy)]">Contratações recentes</h2>
          <Link href="/fornecedores/contratacoes" className="text-sm font-semibold text-[var(--gold)] hover:underline">
            Ver todas →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--gray-500)]">
            Nenhuma contratação ainda. Os comprovantes da Auditoria aparecem aqui após o sync, ou registre uma contratação manual.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                  <th className="px-5 py-3">Serviço</th>
                  <th className="py-3">Fornecedor</th>
                  <th className="py-3">Prazo</th>
                  <th className="py-3">Avaliação</th>
                  <th className="px-5 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-[var(--navy)]">{item.service.name}</p>
                      <p className="text-xs text-[var(--gray-400)]">{formatDate(item.hiredAt)}</p>
                    </td>
                    <td className="py-3.5 text-[var(--gray-600)]">
                      <Link href={`/fornecedores/empresas/${item.service.supplierId}`} className="hover:underline">
                        {item.service.supplier.name}
                      </Link>
                    </td>
                    <td className="py-3.5">
                      {item.salicPaymentId ? (
                        <span className="text-xs font-semibold text-[var(--navy)]">SALIC</span>
                      ) : item.delayed ? (
                        <span className="text-xs font-semibold text-amber-700">Atraso</span>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">No prazo</span>
                      )}
                    </td>
                    <td className="py-3.5">
                      <CatalogStars value={item.rating} />
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[var(--navy)]">
                      {formatCurrency(Number(item.price))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
