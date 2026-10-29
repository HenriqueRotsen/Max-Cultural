import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui";
import { FieldHelp } from "@/components/FieldHelp";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import { getCategoryLabel } from "@/lib/catalog/categories";

export const dynamic = "force-dynamic";

export default async function CatalogVisaoGeralPage() {
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
        breadcrumb="Fornecedores › Visão geral"
        title="Banco de preços"
        description="Resumo do seu banco de preços: quanto já foi gasto com fornecedores, o custo médio de cada contratação e quem atrasa entregas. As contratações entram pelo Planejamento (notas fiscais, RPAs, pedidos e reservas) ou podem ser lançadas à mão."
        actions={
          <>
            <Link href="/fornecedores/empresas/novo" className="btn">
              Novo fornecedor
            </Link>
            <Link href="/fornecedores/mapa" className="btn btn-ghost">
              Mapa
            </Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Gasto total"
          value={formatCurrency(totalSpend)}
          hint={`${engagements} contratações registradas`}
          help="Soma do valor de todas as contratações registradas no banco de preços, desde o início — inclui as que vieram do Planejamento e as lançadas manualmente."
        />
        <StatCard
          label="Custo médio"
          value={formatCurrency(avg)}
          hint="por contratação"
          help="Gasto total dividido pelo número de contratações. Ex.: R$ 10.000 em 4 contratações = R$ 2.500 por contratação."
        />
        <StatCard
          label="Fornecedores"
          value={String(suppliers)}
          hint={`${services} serviços cadastrados`}
          help="Empresas ou pessoas cadastradas no banco de preços. Cada fornecedor pode oferecer vários serviços (ex.: locação de som, transporte), cada um com seu histórico de preços."
        />
        <StatCard
          label="Taxa de atraso"
          value={`${delayRate.toFixed(0)}%`}
          hint={`${delayed} de ${engagements} entregues com atraso`}
          help="Percentual das contratações marcadas como “entregue com atraso”. Ex.: 2 atrasos em 10 contratações = 20%. Quanto menor, mais confiáveis os fornecedores."
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--navy)]">
            Gastos por mês
            <FieldHelp text="Cada barra mostra a soma do valor das contratações feitas no mês. A barra mais longa é o mês de maior gasto; as outras são proporcionais a ele. O número depois do valor é a quantidade de contratações." />
          </h2>
          <p className="mt-0.5 text-xs text-[var(--gray-500)]">
            Valor total contratado em cada mês.
          </p>
          {monthly.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--gray-500)]">Sem contratações ainda.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {monthly.map((m) => (
                <li key={m.month}>
                  <div className="mb-1 flex justify-between text-xs text-[var(--gray-500)]">
                    <span>{m.month}</span>
                    <span>
                      {formatCurrency(m.total_spend)} · {Number(m.count)}{" "}
                      {Number(m.count) === 1 ? "contratação" : "contratações"}
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
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--navy)]">
            Categorias mais contratadas
            <FieldHelp text="As 5 categorias de serviço (ex.: som, alimentação, transporte) com mais contratações. O número à direita é a quantidade de contratações em cada uma." />
          </h2>
          <p className="mt-0.5 text-xs text-[var(--gray-500)]">
            Tipos de serviço que você mais contrata.
          </p>
          {byCategory.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--gray-500)]">Sem dados.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {byCategory.map((row) => (
                <li key={row.category}>
                  <div className="mb-1 flex justify-between text-xs text-[var(--gray-500)]">
                    <span>{getCategoryLabel(row.category)}</span>
                    <span>
                      {Number(row.total)} {Number(row.total) === 1 ? "contratação" : "contratações"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--gray-50)]">
                    <div
                      className="h-full rounded-full accent-bar"
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
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--navy)]">
            Contratações recentes
            <FieldHelp text="As 8 contratações mais novas. “No prazo” ou “Atraso” mostram como foi a entrega." />
          </h2>
          <Link href="/fornecedores/contratacoes" className="text-sm font-semibold text-[var(--gold)] hover:underline">
            Ver todas →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--gray-500)]">
            Nenhuma contratação ainda. Elas aparecem aqui conforme os pagamentos são lançados no Planejamento, ou registre uma contratação manual.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                  <th className="px-5 py-3">Serviço</th>
                  <th className="py-3">Fornecedor</th>
                  <th className="py-3">
                    <span className="inline-flex items-center gap-1">
                      Origem / prazo
                      <FieldHelp text="No prazo / Atraso = situação da entrega informada ao registrar a contratação." />
                    </span>
                  </th>
                  <th className="py-3">
                    <span className="inline-flex items-center gap-1">
                      Avaliação
                      <FieldHelp text="Nota de 1 a 5 estrelas dada ao fornecedor nesta contratação (qualidade do serviço)." />
                    </span>
                  </th>
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
                      {item.delayed ? (
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
