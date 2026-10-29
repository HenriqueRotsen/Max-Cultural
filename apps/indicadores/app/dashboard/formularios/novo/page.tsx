import { AdminShell } from "@/components/admin/admin-shell";
import { FormularioWizard } from "@/components/formularios/formulario-wizard";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import {
  ensureFormularioModelosAction,
  listUsersForProfessorPickerAction,
} from "@/app/actions/formularios";

export default async function NovoFormularioPage() {
  await requireDashboardPermission("formularios:write");
  const [, users] = await Promise.all([
    ensureFormularioModelosAction(),
    listUsersForProfessorPickerAction(),
  ]);

  return (
    <AdminShell title="Novo formulário">
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">
          Novo formulário
        </h1>
        <p className="text-sm text-muted-foreground">
          Contexto → montar perguntas → configuração e mensagem de confirmação.
        </p>
      </div>
      <FormularioWizard professorUsers={users} />
    </AdminShell>
  );
}
