import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { CatalogEngagementForm } from "@/components/catalog/CatalogEngagementForm";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewCatalogEngagementPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const defaultServiceId = Array.isArray(sp.serviceId) ? sp.serviceId[0] : sp.serviceId;
  const { entitlements } = await getWorkspaceContext();
  const services = await prisma.catalogService.findMany({
    where: { supplier: { workspaceId: entitlements.workspaceId } },
    orderBy: { name: "asc" },
    include: { supplier: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores › Contratações › Nova"
        title="Nova contratação"
        description="Registre preço, quantidade, prazo e avaliação."
      />
      {services.length === 0 ? (
        <p className="card p-5 text-sm text-[var(--gray-500)]">
          Cadastre um serviço antes de registrar contratações.
        </p>
      ) : (
        <CatalogEngagementForm
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            supplierName: s.supplier.name,
          }))}
          defaultServiceId={defaultServiceId}
        />
      )}
    </div>
  );
}
