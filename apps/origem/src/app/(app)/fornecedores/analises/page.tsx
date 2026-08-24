import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/format";
import { getCategoryLabel } from "@/lib/catalog/categories";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CatalogAnalyticsPage() {
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const yearCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [byCategory, byState, bySupplier, delayStats, delayed, monthly] = await Promise.all([
    prisma.$queryRaw<Array<{ category: string; avg_price: number; total: bigint }>>`
      SELECT COALESCE(sp.category, 'Sem categoria') as category,
             AVG(e.price)::float as avg_price,
             COUNT(*)::bigint as total
      FROM catalog_engagements e
      JOIN catalog_services sp ON sp.id = e."serviceId"
      JOIN catalog_suppliers s ON s.id = sp."supplierId"
      WHERE e."workspaceId" = ${ws}
        AND e."hiredAt" >= NOW() - INTERVAL '365 days'
      GROUP BY 1
      ORDER BY avg_price DESC
      LIMIT 10
    `,
    prisma.$queryRaw<Array<{ state: string; avg_price: number; total: bigint }>>`
      SELECT COALESCE(s.state, 'N/A') as state,
             AVG(e.price)::float as avg_price,
             COUNT(*)::bigint as total
      FROM catalog_engagements e
      JOIN catalog_services sp ON sp.id = e."serviceId"
      JOIN catalog_suppliers s ON s.id = sp."supplierId"
      WHERE e."workspaceId" = ${ws}
        AND e."hiredAt" >= NOW() - INTERVAL '365 days'
      GROUP BY 1
      ORDER BY total DESC
      LIMIT 12
    `,
    prisma.$queryRaw<
      Array<{ name: string; avg_price: number; avg_rating: number; total: bigint }>
    >`
      SELECT s.name,
             AVG(e.price)::float as avg_price,
             COALESCE(AVG(e.rating)::float, 0) as avg_rating,
             COUNT(*)::bigint as total
      FROM catalog_engagements e
      JOIN catalog_services sp ON sp.id = e."serviceId"
      JOIN catalog_suppliers s ON s.id = sp."supplierId"
      WHERE e."workspaceId" = ${ws}
        AND e."hiredAt" >= NOW() - INTERVAL '365 days'
      GROUP BY s.id, s.name
      ORDER BY total DESC
      LIMIT 8
    `,
    prisma.catalogEngagement.aggregate({
      where: { workspaceId: ws, hiredAt: { gte: yearCutoff } },
      _count: { _all: true },
    }),
    prisma.catalogEngagement.count({
      where: { workspaceId: ws, delayed: true, hiredAt: { gte: yearCutoff } },
    }),
    prisma.$queryRaw<Array<{ month: string; total_spend: number; count: bigint }>>`
      SELECT to_char(date_trunc('month', e."hiredAt"), 'YYYY-MM') as month,
             SUM(e.price)::float as total_spend,
             COUNT(*)::bigint as count
      FROM catalog_engagements e
      WHERE e."workspaceId" = ${ws}
        AND e."hiredAt" >= NOW() - INTERVAL '365 days'
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 6
    `,
  ]);

  const total = delayStats._count._all;
  const delayRate = total > 0 ? (delayed / total) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores › Análises"
        title="Análises"
        description="Posicionamento de preço, tendências e custos do último ano."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
            Contratações (12 meses)
          </p>
          <p className="mt-3 text-2xl font-semibold text-[var(--navy)]">{total}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
            Taxa de atraso
          </p>
          <p className="mt-3 text-2xl font-semibold text-[var(--navy)]">{delayRate.toFixed(0)}%</p>
          <p className="mt-1 text-xs text-[var(--gray-500)]">{delayed} com atraso</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
            Meses com gasto
          </p>
          <p className="mt-3 text-2xl font-semibold text-[var(--navy)]">{monthly.length}</p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-[var(--navy)]">Gasto mensal (último ano)</h2>
        {monthly.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--gray-500)]">Sem dados.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {monthly.map((row) => (
              <li key={row.month} className="flex justify-between text-sm">
                <span className="text-[var(--gray-600)]">{row.month}</span>
                <span className="font-medium text-[var(--navy)]">
                  {formatCurrency(row.total_spend)} · {Number(row.count)}x
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--navy)]">Custo médio por categoria</h2>
          {byCategory.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--gray-500)]">Sem dados.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {byCategory.map((row) => (
                <li key={row.category} className="flex justify-between text-sm">
                  <span className="text-[var(--gray-600)]">{getCategoryLabel(row.category)}</span>
                  <span className="font-medium text-[var(--navy)]">
                    {formatCurrency(row.avg_price)} · {Number(row.total)}x
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--navy)]">Custo médio por UF</h2>
          {byState.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--gray-500)]">Sem dados.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {byState.map((row) => (
                <li key={row.state} className="flex justify-between text-sm">
                  <span className="text-[var(--gray-600)]">{row.state}</span>
                  <span className="font-medium text-[var(--navy)]">
                    {formatCurrency(row.avg_price)} · {Number(row.total)}x
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-[var(--navy)]">Comparativo de fornecedores</h2>
        {bySupplier.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--gray-500)]">Sem dados.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {bySupplier.map((row) => (
              <li key={row.name} className="flex justify-between text-sm">
                <span className="text-[var(--gray-600)]">{row.name}</span>
                <span className="font-medium text-[var(--navy)]">
                  {Number(row.total)}x · {formatCurrency(row.avg_price)} · ★ {row.avg_rating.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
