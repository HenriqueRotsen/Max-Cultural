import Link from "next/link";
import { CatalogPriceDollars } from "@/components/catalog/CatalogPriceDollars";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import { getCategoryLabel } from "@/lib/catalog/categories";
import type { ServiceAlternative } from "@/lib/catalog/service-alternatives";
import type { AxisLevels, PriceLevel } from "@/lib/catalog/price-tiers";
import { formatCurrency } from "@/lib/format";

function reasonChips(alt: ServiceAlternative) {
  const chips: Array<{ label: string; className: string }> = [];
  if (alt.betterPrice) {
    chips.push({
      label: "Melhor preço",
      className: "border-[#a7f3d0] bg-[#ecfdf5] text-[#065f46]",
    });
  }
  if (alt.betterRating) {
    chips.push({
      label: "Melhor avaliação",
      className: "border-[var(--gold)] bg-[var(--gold-soft)] text-[#8a6a3b]",
    });
  }
  if (alt.equal) {
    chips.push({
      label: "Condição equivalente",
      className: "border-[var(--navy-soft)] bg-[var(--navy-soft)] text-[var(--navy)]",
    });
  }
  return chips;
}

export function CatalogServiceAlternatives({
  alternatives,
  tiers,
}: {
  alternatives: ServiceAlternative[];
  tiers?: Map<string, { level: PriceLevel | null; axes?: AxisLevels | null }>;
}) {
  if (alternatives.length === 0) return null;

  return (
    <div className="card overflow-hidden border-[#99f6e4] bg-gradient-to-b from-[#f0fdfa] to-white p-5">
      <h2 className="text-sm font-semibold text-[var(--navy)]">Alternativas</h2>
      <p className="mt-1 text-sm text-[var(--gray-500)]">
        Serviços semelhantes de outros fornecedores, com preço e avaliação iguais ou
        melhores (busca vetorial no nome e na descrição).
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {alternatives.map((alt) => {
          const tier = tiers?.get(alt.serviceId);
          return (
            <Link
              key={alt.serviceId}
              href={`/fornecedores/servicos/${alt.serviceId}`}
              className="block rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm transition hover:border-[var(--navy)]"
            >
              <p className="inline-flex max-w-full flex-wrap items-baseline gap-1.5 font-semibold text-[var(--navy)]">
                <span className="truncate">{alt.serviceName}</span>
                <CatalogPriceDollars
                  level={tier?.level ?? 2}
                  axes={tier?.axes}
                  size="sm"
                />
              </p>
              <p className="mt-1 text-sm text-[var(--gray-500)]">
                {alt.supplierName}
                {alt.category ? ` · ${getCategoryLabel(alt.category)}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CatalogStars value={alt.avgRating} />
                <span className="rounded-full bg-[var(--gray-50)] px-2 py-0.5 text-xs font-medium text-[var(--navy)]">
                  {formatCurrency(alt.avgUnitPrice)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reasonChips(alt).map((chip) => (
                  <span
                    key={chip.label}
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
