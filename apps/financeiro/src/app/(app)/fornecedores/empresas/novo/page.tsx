import { PageBackLink, PageHeader } from "@/components/ui";
import { CatalogSupplierForm } from "@/components/catalog/CatalogSupplierForm";

export default function NewCatalogSupplierPage() {
  return (
    <div className="space-y-6">
      <PageBackLink href="/fornecedores/empresas" label="Voltar aos fornecedores" />
      <PageHeader
        breadcrumb="Fornecedores › Novo"
        title="Novo fornecedor"
        description="Informe o CNPJ ou CPF. Com CNPJ, a razão social e o endereço podem ser preenchidos automaticamente."
      />
      <CatalogSupplierForm />
    </div>
  );
}
