import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { InscricoesTable } from "@/components/admin/inscricoes-table";
import { PageLoading } from "@/components/page-loading";
import { listInscricoesAction } from "@/app/actions/inscricoes";
import { requireDashboardUser } from "@/lib/dashboard-gate";
import { getEffectivePermissions } from "@/lib/permissions";
import { redirectToHubDenied } from "@/lib/hub";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireDashboardUser();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("dashboard:access")) {
    redirectToHubDenied("Sem acesso ao MAX Fluxo.");
  }
  if (!perms.has("inscricoes:read")) {
    // Professor / só formulários: nunca a "base", e sim a lista de respostas.
    if (
      perms.has("formularios:review") ||
      perms.has("formularios:write") ||
      perms.has("formularios:merge")
    ) {
      redirect("/dashboard/formularios");
    }
    redirectToHubDenied("Sem acesso à base do MAX Fluxo.");
  }

  return (
    <AdminShell title="Base completa">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-deep">
          Base completa
        </h1>
        <p className="text-sm text-muted-foreground">
          Consulte e filtre a base. Expanda a linha para um resumo, ou abra a aba
          extendida para ver tudo. Projeto e oficina têm páginas próprias.
        </p>
      </div>

      <Suspense fallback={<PageLoading label="Carregando base…" />}>
        <BaseContent searchParams={searchParams} />
      </Suspense>
    </AdminShell>
  );
}

async function BaseContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  let data: Awaited<ReturnType<typeof listInscricoesAction>> | null = null;
  let error: string | null = null;

  try {
    data = await listInscricoesAction({
      q: str(params.q),
      idProjeto: str(params.idProjeto),
      idOficina: str(params.idOficina),
      proponente: str(params.proponente),
      pronac: str(params.pronac),
      nomeProjeto: str(params.nomeProjeto),
      anoProjeto: str(params.anoProjeto),
      selecionados: str(params.selecionados),
      participantes: str(params.participantes),
      sort: str(params.sort),
      sortDir: str(params.sortDir),
      page,
      pageSize: 20,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar a base";
  }

  if (error) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Não foi possível carregar os dados. Verifique a conexão com o banco e tente
        de novo.
      </div>
    );
  }

  if (!data) return null;

  return (
    <InscricoesTable
      rows={data.rows}
      total={data.total}
      page={data.page}
      pageSize={data.pageSize}
      totalPages={data.totalPages}
      filterOptions={data.filterOptions}
    />
  );
}
