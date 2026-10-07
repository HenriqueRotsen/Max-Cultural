import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireDashboardUser } from "@/lib/dashboard-gate";
import { getEffectivePermissions } from "@/lib/permissions";
import { isProfessorOnlyMode } from "@/lib/formularios/access";
import { listFormulariosAction } from "@/app/actions/formularios";
import { redirectToHubDenied } from "@/lib/hub";

export default async function FormulariosPage() {
  const user = await requireDashboardUser();
  const perms = await getEffectivePermissions(user.id);
  if (
    !perms.has("formularios:write") &&
    !perms.has("formularios:review") &&
    !perms.has("formularios:merge")
  ) {
    redirectToHubDenied("Sem acesso aos formulários do MAX Fluxo.");
  }

  const canWrite = perms.has("formularios:write");
  const professorOnly = isProfessorOnlyMode(user, perms);
  const rows = await listFormulariosAction();

  return (
    <AdminShell title="Formulários">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">
            Formulários
          </h1>
          <p className="text-sm text-muted-foreground">
            {professorOnly
              ? "Oficinas em que você é professor — veja e avalie as respostas."
              : "Crie formulários públicos por oficina. Respostas vão para avaliação antes da base."}
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/formularios/modelos"
              className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm hover:bg-muted/50"
            >
              Modelos
            </Link>
            <Link
              href="/dashboard/formularios/novo"
              className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Novo formulário
            </Link>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/80">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Título</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Oficina</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Respostas</th>
              {canWrite ? (
                <th className="px-3 py-2 font-medium">Link</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-3 py-2">
                  {canWrite ? (
                    <Link
                      className="font-medium text-brand-deep underline-offset-2 hover:underline"
                      href={`/dashboard/formularios/${r.id}`}
                    >
                      {r.titulo}
                    </Link>
                  ) : (
                    <Link
                      className="font-medium text-brand-deep underline-offset-2 hover:underline"
                      href={`/dashboard/formularios/${r.id}/respostas`}
                    >
                      {r.titulo}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.tipo === "AVALIACAO" ? "Avaliação" : "Inscrição"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.oficina
                    ? `${r.oficina.projeto.contexto.nome} · ${r.oficina.nome}`
                    : r.oficinaId}
                </td>
                <td className="px-3 py-2">{r.ativo ? "Ativo" : "Inativo"}</td>
                <td className="px-3 py-2">
                  <Link
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm font-medium text-brand-deep hover:bg-muted/50"
                    href={`/dashboard/formularios/${r.id}/respostas`}
                  >
                    Ver respostas
                    <span className="text-muted-foreground">
                      ({r._count.respostas})
                    </span>
                  </Link>
                </td>
                {canWrite ? (
                  <td className="px-3 py-2">
                    <Link className="text-xs underline" href={`/f/${r.slug}`} target="_blank">
                      /f/{r.slug}
                    </Link>
                  </td>
                ) : null}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={canWrite ? 6 : 5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {professorOnly
                    ? "Nenhuma oficina atribuída a você ainda."
                    : "Nenhum formulário ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
