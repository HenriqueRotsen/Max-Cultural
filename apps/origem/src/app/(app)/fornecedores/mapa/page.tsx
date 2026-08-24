import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { ensureCatalogSuppliersFromAudit } from "@/lib/catalog/from-audit";
import { persistCityCoords, countPendingCnpjAddresses } from "@/lib/catalog/geo";
import { coordsFromSupplier } from "@/lib/catalog/municipio-coords";
import { PageHeader } from "@/components/ui";
import { CatalogBrazilMapClient } from "@/components/catalog/CatalogBrazilMapClient";
import { CatalogMapGeocodeRunner } from "@/components/catalog/CatalogMapGeocodeRunner";

export const dynamic = "force-dynamic";

export default async function CatalogMapPage() {
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  await ensureCatalogSuppliersFromAudit(ws);
  await persistCityCoords(ws);

  const [suppliers, totalCount, pendingCount] = await Promise.all([
    prisma.catalogSupplier.findMany({
      where: { workspaceId: ws },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        address: true,
        latitude: true,
        longitude: true,
        avgRating: true,
      },
    }),
    prisma.catalogSupplier.count({ where: { workspaceId: ws } }),
    countPendingCnpjAddresses(ws),
  ]);

  const pins = suppliers.flatMap((s) => {
    const coords = coordsFromSupplier(s);
    if (!coords) return [];
    return [
      {
        id: s.id,
        name: s.name,
        city: s.city,
        state: s.state,
        address: s.address,
        latitude: coords.lat,
        longitude: coords.lng,
        avgRating: s.avgRating,
      },
    ];
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores › Mapa"
        title="Mapa do Brasil"
        description={`${pins.length} de ${totalCount} fornecedor(es) com ponto no mapa. O município vem do cadastro ou da consulta do CNPJ.`}
      />
      <CatalogMapGeocodeRunner pendingCount={pendingCount} />
      <CatalogBrazilMapClient suppliers={pins} />
    </div>
  );
}
