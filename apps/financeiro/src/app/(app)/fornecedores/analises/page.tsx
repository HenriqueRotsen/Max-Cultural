import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/format";
import { getCategoryLabel } from "@/lib/catalog/categories";
import { PageHeader, StatCard } from "@/components/ui";
import { FieldHelp } from "@/components/FieldHelp";

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
      SELECT COALESCE(s.state, 'Sem UF') as state,
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
      LIMIT 12
    `,
  ]);

  const total = delayStats._count._all;
  const delayRate = total > 0 ? (delayed / total) * 100 : 0;

  const totalSpend12m = monthly.reduce((sum, m) => sum + m.total_spend, 0);
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores › Análises"
        title="Análises"
        description="Resumo das contratações dos últimos 12 meses: quanto foi gasto, quanto custa em média cada tipo de serviço, em cada estado e com cada fornecedor, e com que frequência houve atraso na entrega. Passe o mouse no “?” de cada item para ver como ele é calculado."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Contratações (12 meses)"
          value={String(total)}
          hint={`${formatCurrency(totalSpend12m)} gastos no período`}
          help="Quantidade de contratações registradas nos últimos 12 meses — tanto as lançadas manualmente quanto as que vieram do Planejamento."
        />
        <StatCard
          label="Taxa de atraso"
          value={`${delayRate.toFixed(0)}%`}
          hint={`${plural(delayed, "contratação entregue", "contratações entregues")} com atraso`}
          help="Percentual das contratações dos últimos 12 meses marcadas como “entregue com atraso”. Ex.: 10 contratações com 2 atrasadas = 20%. Quanto menor, melhor."
        />
        <StatCard
          label="Meses com gasto"
          value={String(monthly.length)}
          hint="Dentro dos últimos 12 meses"
          help="Quantos meses distintos tiveram pelo menos uma contratação. Ex.: 8 significa que em 8 dos últimos 12 meses houve gasto com fornecedores."
        />
      </div>

      <div className="card p-5">
        <SectionTitle
          title="Gasto mensal"
          subtitle="Soma do valor das contratações em cada mês (mais recentes primeiro)."
          help="Para cada mês, soma o valor de todas as contratações feitas naquele mês. O número depois do valor é a quantidade de contratações."
        />
        {monthly.length === 0 ? (
          <EmptyHint />
        ) : (
          <ul className="mt-4 space-y-2">
            {monthly.map((row) => (
              <li key={row.month} className="flex justify-between text-sm">
                <span className="text-[var(--gray-600)]">{formatMonth(row.month)}</span>
                <span className="font-medium text-[var(--navy)]">
                  {formatCurrency(row.total_spend)}
                  <span className="ml-2 text-xs font-normal text-[var(--gray-500)]">
                    {plural(Number(row.count), "contratação", "contratações")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <SectionTitle
            title="Custo médio por categoria"
            subtitle="Valor médio pago por contratação em cada tipo de serviço (as 10 mais caras)."
            help="Média do valor das contratações agrupadas pela categoria do serviço (ex.: som, iluminação, alimentação). Serve de referência para saber se um orçamento novo está acima ou abaixo do que você costuma pagar."
          />
          {byCategory.length === 0 ? (
            <EmptyHint />
          ) : (
            <ul className="mt-4 space-y-2">
              {byCategory.map((row) => (
                <li key={row.category} className="flex justify-between text-sm">
                  <span className="text-[var(--gray-600)]">{getCategoryLabel(row.category)}</span>
                  <span className="font-medium text-[var(--navy)]">
                    {formatCurrency(row.avg_price)}
                    <span className="ml-2 text-xs font-normal text-[var(--gray-500)]">
                      média de {plural(Number(row.total), "contratação", "contratações")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <SectionTitle
            title="Custo médio por estado (UF)"
            subtitle="Valor médio por contratação conforme o estado do fornecedor."
            help="Agrupa as contratações pelo estado (UF) cadastrado no fornecedor e calcula o valor médio. Ajuda a comparar preços entre regiões. “Sem UF” = fornecedor sem endereço cadastrado."
          />
          {byState.length === 0 ? (
            <EmptyHint />
          ) : (
            <ul className="mt-4 space-y-2">
              {byState.map((row) => (
                <li key={row.state} className="flex justify-between text-sm">
                  <span className="text-[var(--gray-600)]">{row.state}</span>
                  <span className="font-medium text-[var(--navy)]">
                    {formatCurrency(row.avg_price)}
                    <span className="ml-2 text-xs font-normal text-[var(--gray-500)]">
                      média de {plural(Number(row.total), "contratação", "contratações")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <SectionTitle
          title="Comparativo de fornecedores"
          subtitle="Os 8 fornecedores mais contratados no período."
          help="Para cada fornecedor: quantas vezes foi contratado nos últimos 12 meses, o valor médio por contratação e a nota média (de 1 a 5 estrelas) dada nas avaliações das contratações."
        />
        {bySupplier.length === 0 ? (
          <EmptyHint />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                  <th className="py-2">Fornecedor</th>
                  <th className="py-2 text-right">Contratações</th>
                  <th className="py-2 text-right">Valor médio</th>
                  <th className="py-2 text-right">Nota média</th>
                </tr>
              </thead>
              <tbody>
                {bySupplier.map((row, idx) => (
                  <tr key={`${row.name}-${idx}`} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 text-[var(--gray-600)]">{row.name}</td>
                    <td className="py-2 text-right font-medium text-[var(--navy)]">{Number(row.total)}</td>
                    <td className="py-2 text-right font-medium text-[var(--navy)]">
                      {formatCurrency(row.avg_price)}
                    </td>
                    <td className="py-2 text-right text-[var(--navy)]">
                      {row.avg_rating > 0 ? `★ ${row.avg_rating.toFixed(1)}` : "Sem avaliação"}
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

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-03" → "mar/2026" */
function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return MESES[idx] ? `${MESES[idx]}/${y}` : ym;
}

function SectionTitle({
  title,
  subtitle,
  help,
}: {
  title: string;
  subtitle: string;
  help: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--navy)]">
        {title}
        <FieldHelp text={help} />
      </h2>
      <p className="mt-0.5 text-xs text-[var(--gray-500)]">{subtitle}</p>
    </div>
  );
}

function EmptyHint() {
  return (
    <p className="mt-3 text-sm text-[var(--gray-500)]">
      Sem contratações nos últimos 12 meses. Elas aparecem aqui conforme os pagamentos são
      lançados no Planejamento, ou registre uma contratação manual.
    </p>
  );
}
