import { AdminShell } from "@/components/admin/admin-shell";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import { listPreDefinicaoAction } from "@/app/actions/predefinicao";
import { PreDefinicaoEditor } from "@/components/acompanhamento/predefinicao-editor";

export const dynamic = "force-dynamic";

export default async function PreDefinicaoPage() {
  await requireDashboardPermission("acompanhamento:read");
  const { modelos, tiposAcao, pode } = await listPreDefinicaoAction();
  return (
    <AdminShell title="Configurações · Pré-definição">
      <PreDefinicaoEditor modelos={modelos} tiposAcao={tiposAcao} pode={pode} />
    </AdminShell>
  );
}
