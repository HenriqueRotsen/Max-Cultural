import { AdminShell } from "@/components/admin/admin-shell";
import { ImportWizard } from "@/components/admin/import-wizard";
import { requireDashboardPermission } from "@/lib/dashboard-gate";

export default async function ImportarPage() {
  await requireDashboardPermission("import:write");

  return (
    <AdminShell title="Importar">
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">
          Importar planilha
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha contexto → projeto → oficina e importe as pessoas da planilha.
        </p>
      </div>
      <ImportWizard />
    </AdminShell>
  );
}
