import { AdminShell } from "@/components/admin/admin-shell";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import { listCamposAction } from "@/app/actions/prestacao";
import { ModeloFichaEditor } from "@/components/prestacao/modelo-ficha-editor";

export const dynamic = "force-dynamic";

export default async function ModeloFichaPage() {
  await requireDashboardPermission("prestacao:read");
  const { campos, pode } = await listCamposAction();
  return (
    <AdminShell title="Configurações · Modelo da ficha">
      <ModeloFichaEditor campos={campos} pode={pode} />
    </AdminShell>
  );
}
