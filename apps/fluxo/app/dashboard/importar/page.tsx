import { AdminShell } from "@/components/admin/admin-shell";
import { ImportWizard } from "@/components/admin/import-wizard";
import { listHierarquiaAction } from "@/app/actions/contextos";
import { requireDashboardPermission } from "@/lib/dashboard-gate";

export default async function ImportarPage() {
  await requireDashboardPermission("import:write");
  let contextos: Awaited<ReturnType<typeof listHierarquiaAction>>["contextos"] =
    [];
  let projetos: Awaited<ReturnType<typeof listHierarquiaAction>>["projetos"] =
    [];
  let oficinas: Awaited<ReturnType<typeof listHierarquiaAction>>["oficinas"] =
    [];
  try {
    const data = await listHierarquiaAction();
    contextos = data.contextos;
    projetos = data.projetos;
    oficinas = data.oficinas;
  } catch (err) {
    console.error("[importar/hierarquia]", err);
  }

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
      <ImportWizard
        contextos={contextos}
        projetos={projetos}
        oficinas={oficinas}
      />
    </AdminShell>
  );
}
