import { AdminShell } from "@/components/admin/admin-shell";
import { ContextosManager } from "@/components/admin/contextos-manager";
import {
  listContextosPageAction,
  listOficinasPageAction,
  listProjetosPageAction,
} from "@/app/actions/contextos";
import { HIERARQUIA_PAGE_SIZE } from "@/lib/hierarchy-list";
import {
  listPageCount,
  parseListPage,
} from "@/components/admin/list-pager";
import { requireDashboardPermission } from "@/lib/dashboard-gate";

type Tab = "contextos" | "projetos" | "oficinas";

function parseTab(raw: string | undefined): Tab {
  if (raw === "projetos" || raw === "oficinas") return raw;
  return "contextos";
}

export default async function ContextosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; q?: string }>;
}) {
  await requireDashboardPermission("contextos:read");
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const q = sp.q?.trim() || undefined;

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
    oficinas: [] as Awaited<ReturnType<typeof listOficinasPageAction>>["items"],
  };

  try {
    if (tab === "contextos") {
      const data = await listContextosPageAction({ page: Number(sp.page), q });
      pageCount = data.pageCount;
      page = parseListPage(sp.page, pageCount);
      total = data.total;
      canCreate = data.canCreate;
      canWrite = data.canWrite;
      empty.contextos = data.items;
    } else if (tab === "projetos") {
      const data = await listProjetosPageAction({ page: Number(sp.page), q });
      pageCount = data.pageCount;
      page = parseListPage(sp.page, pageCount);
      total = data.total;
      canCreate = data.canCreate;
      canWrite = data.canWrite;
      empty.projetos = data.items;
    } else {
      const data = await listOficinasPageAction({ page: Number(sp.page), q });
      pageCount = data.pageCount;
      page = parseListPage(sp.page, pageCount);
      total = data.total;
      canCreate = data.canCreate;
      canWrite = data.canWrite;
      empty.oficinas = data.items;
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
          Contexto → Projeto → Oficina
        </h1>
        <p className="text-sm text-muted-foreground">
          Contextos e oficinas são cadastrados aqui. Projetos iniciados no MAX Origem
          são vinculados automaticamente ao contexto inferido pelo nome (ex.: &quot;Arte em
          cores 7&quot; → contexto &quot;Arte em cores&quot;). Só é possível excluir itens sem
          dados vinculados.
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
          contextos={empty.contextos}
          projetos={empty.projetos}
          oficinas={empty.oficinas}
          canCreate={canCreate}
          canWrite={canWrite}
        />
      )}
    </AdminShell>
  );
}
