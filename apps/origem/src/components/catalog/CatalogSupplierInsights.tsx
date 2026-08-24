import Link from "next/link";
import { CatalogPriceDollars } from "@/components/catalog/CatalogPriceDollars";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import { getCategoryLabel } from "@/lib/catalog/categories";
import { getPriceUnitLabel, getPriceUnitSymbol } from "@/lib/catalog/price-units";
import type { SupplierInsights } from "@/lib/catalog/price-tiers";
import { formatTierSummary } from "@/lib/catalog/price-tiers";
import { formatCurrency, formatDate } from "@/lib/format";

function formatServicePrice(priceUnit: string, unitAvg: number | null) {
  if (unitAvg == null || unitAvg <= 0) return null;
  if (priceUnit === "closed") return formatCurrency(unitAvg);
  return `${formatCurrency(unitAvg)} ${getPriceUnitSymbol(priceUnit)}`;
}

export type CatalogServiceRow = {
  id: string;
  name: string;
  category: string | null;
  engagementCount: number;
  avgPrice: number;
  avgRating: number;
  lastHiredAt: Date | string | null;
  lastPrice: number | null;
  lastPriceUnit: string | null;
  lastUnitPrice: number | null;
};

export function CatalogSupplierInsights({
  insights,
  services,
}: {
  insights: SupplierInsights;
  services: CatalogServiceRow[];
}) {
  const delay = insights.delayRate.year;
  const summary = insights.tierSummary.year;
  const insightByService = new Map(insights.services.map((s) => [s.serviceId, s] as const));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
            Taxa de atraso (último ano)
          </p>
          <p className="mt-3 text-2xl font-semibold text-[var(--navy)]">
            {delay != null ? `${delay.toFixed(0)}%` : "—"}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
            Posicionamento (último ano)
          </p>
          <p className="mt-3 text-sm font-medium text-[var(--navy)]">{formatTierSummary(summary)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--navy)]">Serviços / produtos</h2>
        </div>
        {services.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--gray-500)]">
            Nenhum serviço cadastrado neste fornecedor.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {services.map((service) => {
              const insight = insightByService.get(service.id);
              const unitAvg = insight?.avgUnitPrice.year ?? null;
              const priceLabel = insight
                ? formatServicePrice(insight.priceUnit, unitAvg)
                : service.avgPrice > 0
                  ? formatCurrency(service.avgPrice)
                  : null;
              const yearLevel =
                insights.serviceTiers.year[service.id] ??
                insights.serviceTiers.all[service.id] ??
                2;
              const yearAxes =
                insights.serviceAxes.year[service.id] ??
                insights.serviceAxes.all[service.id] ??
                null;

              return (
                <li key={service.id}>
                  <Link
                    href={`/fornecedores/servicos/${service.id}`}
                    className="flex flex-col gap-2 px-5 py-4 transition hover:bg-[var(--gray-50)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="inline-flex flex-wrap items-baseline gap-1.5 font-semibold text-[var(--navy)]">
                          <span>{service.name}</span>
                          <CatalogPriceDollars level={yearLevel} axes={yearAxes} size="sm" />
                        </p>
                        <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                          {service.category ? getCategoryLabel(service.category) : "Sem categoria"} ·{" "}
                          {service.engagementCount}{" "}
                          {service.engagementCount === 1 ? "contratação" : "contratações"}
                          {insight ? ` · ${getPriceUnitLabel(insight.priceUnit)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {priceLabel ? (
                          <span className="rounded-full bg-[var(--gray-50)] px-3 py-1 text-xs font-medium text-[var(--navy)]">
                            Média {priceLabel}
                          </span>
                        ) : null}
                        <CatalogStars value={service.avgRating} />
                      </div>
                    </div>
                    {service.lastHiredAt && service.lastPrice != null ? (
                      <p className="text-xs text-[var(--gray-500)]">
                        Última: {formatDate(service.lastHiredAt)} · {formatCurrency(service.lastPrice)}
                        {service.lastPriceUnit &&
                        service.lastPriceUnit !== "closed" &&
                        service.lastUnitPrice != null
                          ? ` (${formatCurrency(service.lastUnitPrice)} ${getPriceUnitSymbol(service.lastPriceUnit)})`
                          : ""}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
