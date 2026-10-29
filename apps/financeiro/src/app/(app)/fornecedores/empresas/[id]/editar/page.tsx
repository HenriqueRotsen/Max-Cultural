import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageBackLink, PageHeader } from "@/components/ui";
import { CatalogSupplierForm } from "@/components/catalog/CatalogSupplierForm";

export const dynamic = "force-dynamic";

export default async function EditCatalogSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const supplier = await prisma.catalogSupplier.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
  });
  if (!supplier) notFound();

  return (
    <div className="space-y-6">
      <PageBackLink href={`/fornecedores/empresas/${supplier.id}`} label="Voltar à ficha" />
      <PageHeader
        breadcrumb="Fornecedores › Editar"
        title={supplier.name}
        description="Atualize os dados cadastrais. O CNPJ continua único no workspace."
      />
      <CatalogSupplierForm supplier={supplier} />
    </div>
  );
}
