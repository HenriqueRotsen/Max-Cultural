import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { formatCgccpf } from "@/lib/format";
import { CatalogFavoriteButton } from "@/components/catalog/CatalogFavoriteButton";
import { CatalogPriceDollars } from "@/components/catalog/CatalogPriceDollars";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import { PageHeader } from "@/components/ui";
import { getYearTiersForSuppliers } from "@/lib/catalog/pricing-insights";

export const dynamic = "force-dynamic";

export default async function CatalogFavoritesPage() {
  const { entitlements } = await getWorkspaceContext();
  const favorites = await prisma.catalogFavorite.findMany({
    where: { workspaceId: entitlements.workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { include: { _count: { select: { services: true } } } },
    },
  });
  const { suppliers: yearTiers } = await getYearTiersForSuppliers(
    entitlements.workspaceId,
    favorites.map((f) => f.supplier.id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores › Favoritos"
        title="Favoritos"
        description="Acesso rápido aos fornecedores que você marca."
        actions={
          <Link href="/fornecedores/empresas" className="btn btn-ghost">
            Ver todos
          </Link>
        }
      />

      {favorites.length === 0 ? (
        <div className="card space-y-3 px-5 py-12 text-center">
          <p className="text-sm text-[var(--gray-500)]">
            Nenhum favorito ainda. Abra um fornecedor e toque em Favoritar.
          </p>
          <Link href="/fornecedores/empresas" className="btn inline-flex">
            Ir para fornecedores
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {favorites.map(({ supplier: s }) => (
            <div key={s.id} className="card flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/fornecedores/empresas/${s.id}`} className="min-w-0 flex-1">
                  <p className="inline-flex max-w-full items-baseline gap-1.5 truncate font-semibold text-[var(--navy)]">
                    <span className="truncate">{s.name}</span>
                    <CatalogPriceDollars
                      level={yearTiers.get(s.id)?.level ?? 2}
                      axes={yearTiers.get(s.id)?.axes}
                      size="sm"
                    />
                  </p>
                  <p className="truncate text-sm text-[var(--gray-500)]">
                    {formatCgccpf(s.cnpj)}
                    {s.city && s.state ? ` · ${s.city}/${s.state}` : ""}
                    {s.fromAudit ? " · Auditoria" : ""}
                  </p>
                </Link>
                <CatalogFavoriteButton supplierId={s.id} favorited />
              </div>
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-[var(--gray-50)] px-3 py-1 text-xs text-[var(--gray-600)]">
                  {s._count.services} {s._count.services === 1 ? "serviço" : "serviços"}
                </span>
                <CatalogStars value={s.avgRating} count={s.ratingCount} />
              </div>
              <Link href={`/fornecedores/empresas/${s.id}`} className="btn btn-ghost w-full">
                Abrir ficha
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
