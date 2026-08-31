import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageBackLink, PageHeader } from "@/components/ui";
import { CatalogServiceForm } from "@/components/catalog/CatalogServiceForm";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewCatalogServicePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const defaultSupplierId = Array.isArray(sp.supplierId) ? sp.supplierId[0] : sp.supplierId;
  const { entitlements } = await getWorkspaceContext();
  const suppliers = await prisma.catalogSupplier.findMany({
    where: { workspaceId: entitlements.workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <PageBackLink href="/fornecedores/servicos" label="Voltar aos serviços" />
      <PageHeader
        breadcrumb="Fornecedores › Serviços › Novo"
        title="Novo serviço"
        description="Vincule o serviço ou produto a um fornecedor já cadastrado."
      />
      {suppliers.length === 0 ? (
        <p className="card p-5 text-sm text-[var(--gray-500)]">
          Cadastre um fornecedor antes de criar serviços.
        </p>
      ) : (
        <CatalogServiceForm suppliers={suppliers} defaultSupplierId={defaultSupplierId} />
      )}
    </div>
  );
}
