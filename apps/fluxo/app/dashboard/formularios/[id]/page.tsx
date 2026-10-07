import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormularioForm } from "@/components/formularios/formulario-form";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import {
  getFormularioAction,
  listUsersForProfessorPickerAction,
} from "@/app/actions/formularios";
import { toLocalInput } from "@/lib/formularios/datetime-local";
import type { FormularioCampoDraft } from "@/lib/formularios/types";

type Params = Promise<{ id: string }>;

export default async function EditarFormularioPage({ params }: { params: Params }) {
  await requireDashboardPermission("formularios:write");
  const { id } = await params;
  let data;
  try {
    data = await getFormularioAction(id);
  } catch {
    notFound();
  }
  const { form, professores } = data;
  const selectedProfessorIds = professores.map((p) => p.userId);
  const users = await listUsersForProfessorPickerAction(selectedProfessorIds);

  const campos: FormularioCampoDraft[] = form.campos.map((c) => ({
    id: c.id,
    ordem: c.ordem,
    rotulo: c.rotulo,
    descricao: c.descricao,
    obrigatorio: c.obrigatorio,
    tipo: c.tipo as FormularioCampoDraft["tipo"],
    sigaColumn: c.sigaColumn,
    opcoes: (c.opcoes as string[] | null) ?? null,
    config: (c.config as Record<string, unknown> | null) ?? null,
  }));

  return (
    <AdminShell title={form.titulo}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">
            Editar formulário
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.oficina
              ? `${data.oficina.projeto.contexto.nome} · ${data.oficina.projeto.nome} · ${data.oficina.nome}`
              : form.oficinaId}
          </p>
        </div>
        <a
          href={`/dashboard/formularios/${form.id}/respostas`}
          className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm hover:bg-muted/50"
        >
          Ver respostas
        </a>
      </div>
      <FormularioForm
        mode="edit"
        professorUsers={users}
        selectedProfessorIds={selectedProfessorIds}
        initial={{
          id: form.id,
          oficinaId: form.oficinaId,
          titulo: form.titulo,
          descricao: form.descricao,
          abreEm: toLocalInput(form.abreEm),
          encerraEm: toLocalInput(form.encerraEm),
          ativo: form.ativo,
          capaUrl: form.capaUrl,
          mensagemConfirmacao: form.mensagemConfirmacao,
          slug: form.slug,
          campos,
        }}
      />
    </AdminShell>
  );
}
