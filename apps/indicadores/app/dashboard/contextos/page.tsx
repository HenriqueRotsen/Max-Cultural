import { AdminShell } from "@/components/admin/admin-shell";
import { ContextosManager } from "@/components/admin/contextos-manager";
import { podeVerAcompanhamento, podeVerPrestacao } from "@/lib/acompanhamento/acesso";
import {
  listContextosPageAction,
  listAcoesPageAction,
  listProjetosPageAction,
} from "@/app/actions/contextos";
import { HIERARQUIA_PAGE_SIZE } from "@/lib/hierarchy-list";
import type { SortDir } from "@/lib/table-sort";
import {
  listPageCount,
  parseListPage,
} from "@/components/admin/list-pager";
import { requireDashboardPermission } from "@/lib/dashboard-gate";

type Tab = "contextos" | "projetos" | "acoes";

function parseTab(raw: string | undefined): Tab {
  if (raw === "projetos" || raw === "acoes") return raw;
  if (raw === "acoes") return "acoes"; // link antigo
  return "contextos";
}

export default async function ContextosPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    q?: string;
    sort?: string;
    sortDir?: string;
  }>;
}) {
  await requireDashboardPermission("contextos:read");
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const q = sp.q?.trim() || undefined;
  const sort = sp.sort?.trim() || "nome";
  const sortDir: SortDir = sp.sortDir === "desc" ? "desc" : "asc";
  const listParams = { page: Number(sp.page), q, sort, sortDir };

  let error: string | null = null;
  let canCreate = false;
  let canWrite = false;
  let page = 1;
  let pageCount = 1;
  let total = 0;

  const empty = {
    contextos: [] as Awaited<
      ReturnType<typeof listContextosPageAction>
    >["items"],
    projetos: [] as Awaited<ReturnType<typeof listProjetosPageAction>>["items"],
    acoes: [] as Awaited<ReturnType<typeof listAcoesPageAction>>["items"],
  };

  try {
    if (tab === "contextos") {
      const data = await listContextosPageAction(listParams);
      pageCount = data.pageCount;
      page = parseListPage(sp.page, pageCount);
      total = data.total;
      canCreate = data.canCreate;
      canWrite = data.canWrite;
      empty.contextos = data.items;
    } else if (tab === "projetos") {
      const data = await listProjetosPageAction(listParams);
      pageCount = data.pageCount;
      page = parseListPage(sp.page, pageCount);
      total = data.total;
      canCreate = data.canCreate;
      canWrite = data.canWrite;
      empty.projetos = data.items;
    } else {
      const data = await listAcoesPageAction(listParams);
      pageCount = data.pageCount;
      page = parseListPage(sp.page, pageCount);
      total = data.total;
      canCreate = data.canCreate;
      canWrite = data.canWrite;
      empty.acoes = data.items;
    }
  } catch (err) {
    console.error("[contextos]", err);
    error =
      err instanceof Error
        ? `Não foi possível carregar: ${err.message}`
        : "Não foi possível carregar a hierarquia.";
    page = parseListPage(sp.page, 1);
    pageCount = listPageCount(total, HIERARQUIA_PAGE_SIZE);
  }

  return (
    <AdminShell title="Contextos">
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">
          Contexto → Projeto → Ação
        </h1>
        <p className="text-sm text-muted-foreground">
          Contextos, projetos e ações são cadastrados aqui (ou direto na importação e
          na criação de formulários). Cada ação informa onde acontece: online e/ou
          os territórios presenciais. Só é possível excluir itens sem dados vinculados.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : (
        <ContextosManager
          tab={tab}
          page={page}
          pageCount={pageCount}
          total={total}
          q={q ?? ""}
          sort={sort}
          sortDir={sortDir}
          contextos={empty.contextos}
          projetos={empty.projetos}
          acoes={empty.acoes}
          canCreate={canCreate}
          canWrite={canWrite}
          canAcompanhamento={await podeVerAcompanhamento()}
          canPrestacao={await podeVerPrestacao()}
        />
      )}
    </AdminShell>
  );
}
