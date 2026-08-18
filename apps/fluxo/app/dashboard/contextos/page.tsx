import { AdminShell } from "@/components/admin/admin-shell";
import { ContextosManager } from "@/components/admin/contextos-manager";
import { listHierarquiaAction } from "@/app/actions/contextos";
import { requireDashboardPermission } from "@/lib/dashboard-gate";

export default async function ContextosPage() {
  await requireDashboardPermission("contextos:read");
  let error: string | null = null;
  let contextos: Awaited<ReturnType<typeof listHierarquiaAction>>["contextos"] =
    [];
  let projetos: Awaited<ReturnType<typeof listHierarquiaAction>>["projetos"] =
    [];
  let oficinas: Awaited<ReturnType<typeof listHierarquiaAction>>["oficinas"] =
    [];
  let canCreate = false;
  let canWrite = false;

  try {
    const data = await listHierarquiaAction();
    contextos = data.contextos;
    projetos = data.projetos;
    oficinas = data.oficinas;
    canCreate = data.canCreate;
    canWrite = data.canWrite;
  } catch (err) {
    console.error("[contextos]", err);
    error =
      err instanceof Error
        ? `Não foi possível carregar: ${err.message}`
        : "Não foi possível carregar a hierarquia.";
  }

  return (
    <AdminShell title="Contextos">
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">
          Contexto → Projeto → Oficina
        </h1>
        <p className="text-sm text-muted-foreground">
          Cadastre o programa (contexto), as edições (projetos com PRONAC) e as
          oficinas. Só é possível excluir itens sem dados vinculados. Edições
          ficam registradas na auditoria.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : (
        <ContextosManager
          initialContextos={contextos}
          initialProjetos={projetos}
          initialOficinas={oficinas}
          canCreate={canCreate}
          canWrite={canWrite}
        />
      )}
    </AdminShell>
  );
}
