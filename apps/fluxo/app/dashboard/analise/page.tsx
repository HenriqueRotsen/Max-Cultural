import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AnaliseDashboard } from "@/components/admin/analise-dashboard";
import { PageLoading } from "@/components/page-loading";
import { getAnaliseAction } from "@/app/actions/inscricoes";
import { requireDashboardPermission } from "@/lib/dashboard-gate";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireDashboardPermission("analise:read");

  return (
    <AdminShell title="Análise">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-deep">
          Análise por oficina
        </h1>
        <p className="text-sm text-muted-foreground">
          Totais de inscritos, selecionados, participantes e certificados — com visão
          de funil e exportação.
        </p>
      </div>

      <Suspense fallback={<PageLoading label="Carregando análise…" />}>
        <AnaliseContent searchParams={searchParams} />
      </Suspense>
    </AdminShell>
  );
}

async function AnaliseContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof getAnaliseAction>> | null = null;
  let error: string | null = null;

  try {
    data = await getAnaliseAction({
      idProjeto: str(params.idProjeto),
      idOficina: str(params.idOficina),
      estado: str(params.estado),
      cidade: str(params.cidade),
      territorio: str(params.territorio),
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Erro ao carregar análise";
  }

  if (error) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Não foi possível carregar a análise.
      </div>
    );
  }

  if (!data) return null;

  return <AnaliseDashboard data={data} />;
}
