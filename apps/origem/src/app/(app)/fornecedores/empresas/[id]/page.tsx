import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { formatCgccpf } from "@/lib/format";
import { formatAddressDisplay } from "@/lib/catalog/address";
import { deleteCatalogSupplier } from "@/lib/catalog/actions";
import { getSupplierInsights } from "@/lib/catalog/pricing-insights";
import { PageHeader } from "@/components/ui";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import { CatalogFavoriteButton } from "@/components/catalog/CatalogFavoriteButton";
import { CatalogPriceDollars } from "@/components/catalog/CatalogPriceDollars";
import { CatalogSupplierInsights } from "@/components/catalog/CatalogSupplierInsights";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

export default async function CatalogSupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;

  const supplier = await prisma.catalogSupplier.findFirst({
    where: { id, workspaceId: ws },
    include: {
      services: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { engagements: true } },
          engagements: { orderBy: { hiredAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!supplier) notFound();

  const insights = await getSupplierInsights(ws, supplier.id);

  const favorited =
    (await prisma.catalogFavorite.findUnique({
      where: { workspaceId_supplierId: { workspaceId: ws, supplierId: supplier.id } },
      select: { id: true },
    })) != null;

  const salic = await prisma.supplier.findUnique({
    where: { cgccpf: supplier.cnpj },
    select: { id: true },
  });

  const engagementCount = supplier.services.reduce((sum, s) => sum + s._count.engagements, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores › Ficha"
        title={
          <span className="inline-flex flex-wrap items-baseline gap-2">
            <span>{supplier.name}</span>
            <CatalogPriceDollars
              level={insights.avgTier.year ?? insights.avgTier.all ?? 2}
              axes={insights.avgAxes.year ?? insights.avgAxes.all}
              size="lg"
            />
          </span>
        }
        description={`${formatCgccpf(supplier.cnpj)}${supplier.city && supplier.state ? ` · ${supplier.city}/${supplier.state}` : ""}${supplier.fromAudit ? " · origem na Auditoria SALIC" : ""}`}
        actions={
          <>
            <CatalogFavoriteButton supplierId={supplier.id} favorited={favorited} />
            <Link href={`/fornecedores/servicos/novo?supplierId=${supplier.id}`} className="btn">
              Novo serviço
            </Link>
            <Link href={`/fornecedores/empresas/${supplier.id}/editar`} className="btn btn-ghost">
              Editar
            </Link>
            {salic ? (
              <Link href={`/panorama/${salic.id}?from=catalog`} className="btn btn-ghost">
                Ver na auditoria
              </Link>
            ) : null}
            {supplier.fromAudit ? null : (
              <form action={deleteCatalogSupplier.bind(null, supplier.id)}>
                <ConfirmSubmitButton
                  className="btn btn-ghost"
                  message={`Excluir “${supplier.name}”? Serviços e ${engagementCount} contratações vinculadas serão removidos.`}
                  title="Excluir fornecedor"
                  confirmLabel="Excluir"
                >
                  Excluir
                </ConfirmSubmitButton>
              </form>
            )}
          </>
        }
      />

      <div className="flex items-center gap-3">
        <CatalogStars value={supplier.avgRating} count={supplier.ratingCount} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">Contato</p>
          <p className="mt-3 text-sm text-[var(--navy)]">{supplier.phone || "Telefone não informado"}</p>
          <p className="mt-1 text-sm text-[var(--gray-600)]">{supplier.email || "E-mail não informado"}</p>
        </div>
        <div className="card p-5 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">Endereço</p>
          <p className="mt-3 text-sm text-[var(--navy)]">
            {formatAddressDisplay({
              streetType: supplier.streetType,
              streetName: supplier.streetName,
              streetNumber: supplier.streetNumber,
              complement: supplier.complement,
              neighborhood: supplier.neighborhood,
              city: supplier.city,
              state: supplier.state,
              zipCode: supplier.zipCode,
              address: supplier.address,
            })}
          </p>
        </div>
      </div>

      {supplier.notes ? (
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">Notas</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--gray-600)]">{supplier.notes}</p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Link
          href={`/fornecedores/servicos/novo?supplierId=${supplier.id}`}
          className="text-sm font-semibold text-[var(--gold)] hover:underline"
        >
          Adicionar serviço →
        </Link>
      </div>

      <CatalogSupplierInsights
        insights={insights}
        services={supplier.services.map((service) => {
          const last = service.engagements[0];
          return {
            id: service.id,
            name: service.name,
            category: service.category,
            engagementCount: service._count.engagements,
            avgPrice: service.avgPrice,
            avgRating: service.avgRating,
            lastHiredAt: last?.hiredAt ?? null,
            lastPrice: last ? Number(last.price) : null,
            lastPriceUnit: last?.priceUnit ?? null,
            lastUnitPrice: last ? Number(last.unitPrice) : null,
          };
        })}
      />
    </div>
  );
}
