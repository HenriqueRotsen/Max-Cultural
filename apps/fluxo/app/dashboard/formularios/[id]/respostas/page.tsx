import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  RespostasQueue,
  type RespostaCampoMeta,
  type RespostaRow,
} from "@/components/formularios/respostas-queue";
import { requireDashboardUser } from "@/lib/dashboard-gate";
import { getEffectivePermissions } from "@/lib/permissions";
import {
  campoOcultoParaProfessor,
  isProfessorOnlyMode,
} from "@/lib/formularios/access";
import {
  getFormularioAction,
  listRespostasAction,
} from "@/app/actions/formularios";

type Params = Promise<{ id: string }>;

export default async function FormularioRespostasPage({ params }: { params: Params }) {
  const user = await requireDashboardUser();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("dashboard:access")) redirect("/dashboard");
  if (
    !perms.has("formularios:review") &&
    !perms.has("formularios:write") &&
    !perms.has("formularios:merge")
  ) {
    redirect("/dashboard");
  }

  const { id } = await params;
  let data;
  try {
    data = await getFormularioAction(id);
  } catch {
    notFound();
  }

  const professorMode = isProfessorOnlyMode(user, perms);
  const respostasRaw = await listRespostasAction(id);
  const respostas: RespostaRow[] = respostasRaw.map((r) => ({
    id: r.id,
    cpf: r.cpf,
    status: r.status,
    selecionados: r.selecionados,
    participantes: r.participantes,
    certificado: r.certificado,
    professorNome: r.professorNome ?? "",
    submittedAt: r.submittedAt.toISOString(),
    payload: (r.payload as RespostaRow["payload"]) ?? {},
  }));

  const canEditData = user.isSuperAdmin || perms.has("formularios:write");

  const campos: RespostaCampoMeta[] = data.form.campos.map((c) => ({
    id: c.id,
    rotulo: c.rotulo,
    tipo: c.tipo,
    sigaColumn: c.sigaColumn,
    ocultoProfessor: campoOcultoParaProfessor(
      (c.config as Record<string, unknown> | null) ?? null,
    ),
    ordem: c.ordem,
    opcoes: (c.opcoes as string[] | null) ?? null,
  }));

  const oficinaLabel = data.oficina
    ? `${data.oficina.projeto.contexto.nome} · ${data.oficina.projeto.nome} · ${data.oficina.nome}`
    : data.form.oficinaId;

  return (
    <AdminShell title={`Respostas · ${data.form.titulo}`}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">
            Respostas
          </h1>
          <p className="text-sm text-muted-foreground">
            {oficinaLabel}
            <span className="mx-1.5 text-border">·</span>
            {data.form.titulo}
          </p>
        </div>
        <div className="flex gap-2">
          {perms.has("formularios:write") ? (
            <Link
              href={`/dashboard/formularios/${id}`}
              className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm hover:bg-muted/50"
            >
              Editar formulário
            </Link>
          ) : null}
          <Link
            href="/dashboard/formularios"
            className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm hover:bg-muted/50"
          >
            Voltar
          </Link>
        </div>
      </div>

      <RespostasQueue
        formularioId={id}
        oficinaLabel={oficinaLabel}
        respostas={respostas}
        canMerge={perms.has("formularios:merge")}
        canEditData={canEditData}
        professorMode={professorMode}
        viewerName={user.name}
        campos={campos}
      />
    </AdminShell>
  );
}
