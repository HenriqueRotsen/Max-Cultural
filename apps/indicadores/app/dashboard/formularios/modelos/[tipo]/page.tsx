import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ModeloForm } from "@/components/formularios/modelo-form";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import { getFormularioModeloByTipoAction } from "@/app/actions/formularios";

type Params = Promise<{ tipo: string }>;

function parseTipo(raw: string): "INSCRICAO" | "AVALIACAO" | null {
  const t = raw.toUpperCase();
  if (t === "INSCRICAO" || t === "AVALIACAO") return t;
  return null;
}

export default async function EditarModeloPage({ params }: { params: Params }) {
  await requireDashboardPermission("formularios:write");
  const { tipo: raw } = await params;
  const tipo = parseTipo(raw);
  if (!tipo) notFound();

  const modelo = await getFormularioModeloByTipoAction(tipo);

  return (
    <AdminShell title={`Modelo · ${modelo.nome}`}>
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">
          Editar modelo · {modelo.nome}
        </h1>
        <p className="text-sm text-muted-foreground">
          Alterações valem para novos formulários. Formulários já criados não mudam
          automaticamente.
        </p>
      </div>
      <ModeloForm
        tipo={tipo}
        initial={{
          nome: modelo.nome,
          tituloDefault: modelo.tituloDefault,
          descricaoDefault: modelo.descricaoDefault,
          mensagemConfirmacao: modelo.mensagemConfirmacao,
          capaUrlDefault: modelo.capaUrlDefault,
          campos: modelo.campos,
        }}
      />
    </AdminShell>
  );
}
