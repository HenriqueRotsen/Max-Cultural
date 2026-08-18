import { AdminShell } from "@/components/admin/admin-shell";
import { PapeisManager } from "@/components/admin/papeis-manager";
import { listAccessBootstrapAction } from "@/app/actions/acesso";
import { requireDashboardPermission } from "@/lib/dashboard-gate";

export default async function PapeisPage() {
  await requireDashboardPermission("roles:read");
  const data = await listAccessBootstrapAction();

  return (
    <AdminShell title="Papéis">
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand-deep">
          Papéis e permissões
        </h1>
        <p className="text-sm text-muted-foreground">
          Defina permissões de tela e o acesso padrão a contextos, projetos e
          oficinas — como na criação de usuários.
        </p>
      </div>
      <PapeisManager data={data} />
    </AdminShell>
  );
}
