import { AdminShell } from "@/components/admin/admin-shell";
import { UsuariosManager } from "@/components/admin/usuarios-manager";
import { listAccessBootstrapAction } from "@/app/actions/acesso";
import { requireDashboardPermission } from "@/lib/dashboard-gate";

export default async function UsuariosPage() {
  await requireDashboardPermission("usuarios:read");
  const data = await listAccessBootstrapAction();

  return (
    <AdminShell title="Usuários">
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand-deep">
          Usuários
        </h1>
        <p className="text-sm text-muted-foreground">
          Cadastro, papéis, overrides e escopo de contextos/projetos/oficinas.
        </p>
      </div>
      <UsuariosManager data={data} />
    </AdminShell>
  );
}
