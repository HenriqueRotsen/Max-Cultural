import Link from "next/link";
import { notFound } from "next/navigation";
import { EngagementDocsButton } from "@/components/catalog/EngagementDocsButton";
import { CatalogPriceDollars } from "@/components/catalog/CatalogPriceDollars";
import { CatalogServiceAlternatives } from "@/components/catalog/CatalogServiceAlternatives";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import { PageHeader } from "@/components/ui";
import { getCategoryLabel } from "@/lib/catalog/categories";
import { getPriceUnitLabel } from "@/lib/catalog/price-units";
import { getSupplierInsights } from "@/lib/catalog/pricing-insights";
import { getServiceAlternatives } from "@/lib/catalog/service-alternatives";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CatalogServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;

  const service = await prisma.catalogService.findFirst({
    where: { id, supplier: { workspaceId: ws } },
    include: {
      supplier: true,
      engagements: {
        orderBy: { hiredAt: "desc" },
        include: {
          documents: {
            select: { id: true, kind: true, filename: true, mimeType: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!service) notFound();

  const insights = await getSupplierInsights(ws, service.supplierId);
  const yearTier =
    insights.serviceTiers.year[service.id] ??
    insights.serviceTiers.all[service.id] ??
    2;
  const yearAxes =
    insights.serviceAxes.year[service.id] ??
    insights.serviceAxes.all[service.id] ??
    null;
  const delayedCount = service.engagements.filter((e) => e.delayed).length;
  const delayRate =
    service.engagements.length > 0
      ? (delayedCount / service.engagements.length) * 100
      : 0;

  const alternatives = await getServiceAlternatives(ws, service.id);
  const altTiers = new Map<
    string,
    { level: typeof yearTier; axes: typeof yearAxes }
  >();
  await Promise.all(
    alternatives.map(async (alt) => {
      const altInsights = await getSupplierInsights(ws, alt.supplierId);
      altTiers.set(alt.serviceId, {
        level:
          altInsights.serviceTiers.year[alt.serviceId] ??
          altInsights.serviceTiers.all[alt.serviceId] ??
          2,
        axes:
          altInsights.serviceAxes.year[alt.serviceId] ??
          altInsights.serviceAxes.all[alt.serviceId] ??
          null,
      });
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores › Serviços"
        title={
          <span className="inline-flex flex-wrap items-baseline gap-2">
            <span>{service.name}</span>
            <CatalogPriceDollars level={yearTier} axes={yearAxes} size="lg" />
          </span>
        }
        description={`${service.supplier.name}${service.category ? ` · ${getCategoryLabel(service.category)}` : ""}${service.defaultPriceUnit ? ` · ${getPriceUnitLabel(service.defaultPriceUnit)}` : ""}`}
        actions={
          <>
            <Link
              href={`/fornecedores/contratacoes/novo?serviceId=${service.id}`}
              className="btn"
            >
              Nova contratação
            </Link>
            <Link href={`/fornecedores/empresas/${service.supplierId}`} className="btn btn-ghost">
              Ver fornecedor
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <CatalogStars value={service.avgRating} count={service.ratingCount} />
        <span className="rounded-full bg-[var(--gray-50)] px-3 py-1 text-xs font-medium text-[var(--navy)]">
          Média {formatCurrency(service.avgPrice)}
        </span>
        <span className="rounded-full bg-[var(--gray-50)] px-3 py-1 text-xs font-medium text-[var(--navy)]">
          {delayRate.toFixed(0)}% atrasos
        </span>
      </div>

      {service.description ? (
        <div className="card p-5 text-sm text-[var(--gray-600)]">{service.description}</div>
      ) : null}

      <CatalogServiceAlternatives alternatives={alternatives} tiers={altTiers} />

      <div className="card overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--navy)]">Histórico de contratações</h2>
        </div>
        {service.engagements.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--gray-500)]">
            Nenhuma contratação ainda.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {service.engagements.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--navy)]">{formatDate(e.hiredAt)}</p>
                  <p className="text-xs text-[var(--gray-500)]">
                    {e.delayed ? `Atraso${e.delayDays ? ` · ${e.delayDays} dia(s)` : ""}` : "No prazo"}
                    {e.rating ? ` · nota ${e.rating}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <EngagementDocsButton
                    engagementId={e.id}
                    serviceName={service.name}
                    documents={e.documents.map((d) => ({
                      id: d.id,
                      kind: d.kind,
                      filename: d.filename,
                      mimeType: d.mimeType,
                    }))}
                  />
                  <span className="font-semibold text-[var(--navy)]">{formatCurrency(Number(e.price))}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
