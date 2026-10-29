import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import { listFormularioModelosAction } from "@/app/actions/formularios";

export default async function FormularioModelosPage() {
  await requireDashboardPermission("formularios:write");
  const modelos = await listFormularioModelosAction();

  return (
    <AdminShell title="Modelos de formulário">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">
            Modelos
          </h1>
          <p className="text-sm text-muted-foreground">
            Edite os modelos pré-carregados de inscrição e avaliação usados ao criar formulários.
          </p>
        </div>
        <Link
          href="/dashboard/formularios"
          className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm hover:bg-muted/50"
        >
          Voltar
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {modelos.map((m) => (
          <Link
            key={m.id}
            href={`/dashboard/formularios/modelos/${m.tipo.toLowerCase()}`}
            className="rounded-lg border border-border/80 bg-card p-5 transition-colors hover:border-brand-deep/40 hover:bg-brand-deep/5"
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {m.tipo === "INSCRICAO" ? "Inscrição" : "Avaliação"}
            </p>
            <h2 className="mt-1 font-heading text-lg font-semibold text-brand-deep">
              {m.nome}
            </h2>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {m.tituloDefault || "Sem título padrão"}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {m.campos.length} pergunta(s) · atualizado{" "}
              {new Date(m.updatedAt).toLocaleString("pt-BR")}
            </p>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
