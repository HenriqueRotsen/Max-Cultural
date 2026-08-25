"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  createContextoAction,
  createOficinaAction,
  deleteContextoAction,
  deleteOficinaAction,
  deleteProjetoAction,
  listContextosSelectAction,
  listProjetosSelectAction,
  updateContextoAction,
  updateOficinaAction,
  updateProjetoAction,
} from "@/app/actions/contextos";
import {
  toggleSortDir,
  type SortDir,
} from "@/lib/table-sort";
import type {
  ContextoSelectOption,
  ProjetoSelectOption,
} from "@/lib/hierarchy-list";
import type {
  ContextoDTO,
  OficinaDTO,
  ProjetoDTO,
} from "@/lib/contexto";
import { ListPager } from "@/components/admin/list-pager";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SortableTableHead } from "@/components/sortable-table-head";

type Tab = "contextos" | "projetos" | "oficinas";

type Props = {
  tab: Tab;
  page: number;
  pageCount: number;
  total: number;
  q: string;
  contextos: ContextoDTO[];
  projetos: ProjetoDTO[];
  oficinas: OficinaDTO[];
  canCreate?: boolean;
  canWrite?: boolean;
  sort: string;
  sortDir: SortDir;
};

export function ContextosManager({
  tab,
  page,
  pageCount,
  total,
  q,
  contextos,
  projetos,
  oficinas,
  canCreate = false,
  canWrite = false,
  sort,
  sortDir,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(q);

  const [ctxOpen, setCtxOpen] = useState(false);
  const [ctxEditId, setCtxEditId] = useState<string | null>(null);
  const [ctxNome, setCtxNome] = useState("");

  const [projOpen, setProjOpen] = useState(false);
  const [projEditId, setProjEditId] = useState<string | null>(null);
  const [projForm, setProjForm] = useState({
    contextoId: "",
    nome: "",
    pronac: "",
    proponente: "",
    ano: String(new Date().getFullYear()),
  });
  const [projContextos, setProjContextos] = useState<ContextoSelectOption[]>(
    [],
  );

  const [ofOpen, setOfOpen] = useState(false);
  const [ofEditId, setOfEditId] = useState<string | null>(null);
  const [ofForm, setOfForm] = useState({
    contextoId: "",
    projetoId: "",
    nome: "",
  });
  const [ofContextos, setOfContextos] = useState<ContextoSelectOption[]>([]);
  const [ofProjetos, setOfProjetos] = useState<ProjetoSelectOption[]>([]);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  const [projCtxSearch, setProjCtxSearch] = useState("");

  useEffect(() => {
    if (!projOpen) {
      setProjCtxSearch("");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listContextosSelectAction({
        q: projCtxSearch,
        editableOnly: true,
      }).then((rows) => {
        if (!cancelled) setProjContextos(rows);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projOpen, projCtxSearch]);

  useEffect(() => {
    if (!ofOpen) return;
    let cancelled = false;
    void listContextosSelectAction({ editableOnly: true }).then((rows) => {
      if (!cancelled) setOfContextos(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [ofOpen]);

  useEffect(() => {
    if (!ofOpen || !ofForm.contextoId) {
      setOfProjetos([]);
      return;
    }
    let cancelled = false;
    void listProjetosSelectAction({ contextoId: ofForm.contextoId }).then(
      (rows) => {
        if (!cancelled) setOfProjetos(rows);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ofOpen, ofForm.contextoId]);

  const pagerParams = useMemo(
    () => ({
      tab,
      q: q || undefined,
      page: page > 1 ? String(page) : undefined,
      sort: sort !== "nome" ? sort : undefined,
      sortDir: sortDir !== "asc" ? sortDir : undefined,
    }),
    [tab, q, page, sort, sortDir],
  );

  function listHref(next: {
    tab?: Tab;
    q?: string;
    page?: number;
    sort?: string;
    sortDir?: SortDir;
  }) {
    const params = new URLSearchParams();
    params.set("tab", next.tab ?? tab);
    const query = next.q ?? q;
    if (query) params.set("q", query);
    const p = next.page ?? page;
    if (p > 1) params.set("page", String(p));
    const s = next.sort ?? sort;
    const d = next.sortDir ?? sortDir;
    if (s && s !== "nome") params.set("sort", s);
    if (d && d !== "asc") params.set("sortDir", d);
    return `/dashboard/contextos?${params.toString()}`;
  }

  function toggleSort(key: string) {
    startTransition(() => {
      router.push(
        listHref({
          sort: key,
          sortDir: toggleSortDir(sort, sortDir, key),
          page: 1,
        }),
      );
    });
  }

  function tabHref(next: Tab) {
    return listHref({ tab: next, page: 1, sort: "nome", sortDir: "asc" });
  }

  function refreshList() {
    router.refresh();
  }

  function openCreateCtx() {
    setCtxEditId(null);
    setCtxNome("");
    setCtxOpen(true);
  }

  function openEditCtx(c: ContextoDTO) {
    setCtxEditId(c.id);
    setCtxNome(c.nome);
    setCtxOpen(true);
  }

  async function saveCtx() {
    startTransition(async () => {
      if (ctxEditId) {
        const r = await updateContextoAction(ctxEditId, { nome: ctxNome });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Contexto atualizado");
      } else {
        const r = await createContextoAction({ nome: ctxNome });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Contexto criado");
      }
      setCtxOpen(false);
      refreshList();
    });
  }

  async function removeCtx(id: string) {
    startTransition(async () => {
      const r = await deleteContextoAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Contexto excluído");
      refreshList();
    });
  }

  function openEditProj(p: ProjetoDTO) {
    setProjEditId(p.id);
    setProjForm({
      contextoId: p.contextoId,
      nome: p.nome,
      pronac: p.pronac,
      proponente: p.proponente,
      ano: p.ano,
    });
    setProjOpen(true);
  }

  async function saveProj() {
    if (!projEditId) return;
    startTransition(async () => {
      const r = await updateProjetoAction(projEditId, projForm);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Projeto atualizado");
      setProjOpen(false);
      refreshList();
    });
  }

  async function removeProj(id: string) {
    startTransition(async () => {
      const r = await deleteProjetoAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Projeto excluído");
      refreshList();
    });
  }

  async function openCreateOf() {
    const contextosRows = await listContextosSelectAction({ editableOnly: true });
    const ctxId = contextosRows[0]?.id ?? "";
    let projetoId = "";
    if (ctxId) {
      const projetosRows = await listProjetosSelectAction({ contextoId: ctxId });
      projetoId = projetosRows[0]?.id ?? "";
    }
    setOfEditId(null);
    setOfForm({ contextoId: ctxId, projetoId, nome: "" });
    setOfOpen(true);
  }

  function openEditOf(o: OficinaDTO) {
    setOfEditId(o.id);
    setOfForm({
      contextoId: o.contextoId,
      projetoId: o.projetoId,
      nome: o.nome,
    });
    setOfOpen(true);
  }

  async function saveOf() {
    startTransition(async () => {
      if (ofEditId) {
        const r = await updateOficinaAction(ofEditId, {
          projetoId: ofForm.projetoId,
          nome: ofForm.nome,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Oficina atualizada");
      } else {
        const r = await createOficinaAction({
          projetoId: ofForm.projetoId,
          nome: ofForm.nome,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Oficina criada");
      }
      setOfOpen(false);
      refreshList();
    });
  }

  async function removeOf(id: string) {
    startTransition(async () => {
      const r = await deleteOficinaAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Oficina excluída");
      refreshList();
    });
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "contextos", label: "Contextos" },
    { id: "projetos", label: "Projetos" },
    { id: "oficinas", label: "Oficinas" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-brand/10 bg-white/80 p-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={tabHref(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition",
                tab === t.id
                  ? "bg-brand-soft font-medium text-brand-deep"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {canCreate && tab !== "projetos" ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (tab === "contextos") openCreateCtx();
              else if (tab === "oficinas") void openCreateOf();
            }}
          >
            <Plus className="size-3.5" />
            Novo
          </Button>
        ) : null}
      </div>

      <form
        method="get"
        action="/dashboard/contextos"
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="tab" value={tab} />
        <div className="min-w-[14rem] flex-1 space-y-1">
          <Label htmlFor="hierarquia-q" className="text-xs">
            Buscar
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="hierarquia-q"
              name="q"
              value={searchDraft}
              placeholder={
                tab === "contextos"
                  ? "Nome do contexto…"
                  : tab === "projetos"
                    ? "Nome, PRONAC ou proponente…"
                    : "Nome da oficina ou projeto…"
              }
              className="pl-9"
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" variant="outline" size="sm" className="mb-0.5">
          Filtrar
        </Button>
        {q ? (
          <Link
            href={tabHref(tab)}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "mb-0.5",
            )}
          >
            Limpar
          </Link>
        ) : null}
      </form>

      {tab === "contextos" ? (
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 bg-brand-mist/50 px-4 py-2">
            <SortableTableHead
              label="Nome"
              sortKey="nome"
              activeKey={sort}
              activeDir={sortDir}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Projetos"
              sortKey="projetos"
              activeKey={sort}
              activeDir={sortDir}
              onSort={toggleSort}
              className="w-28 justify-end"
              align="right"
            />
          </div>
          <ul className="divide-y divide-border/60">
            {contextos.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {q
                  ? "Nenhum contexto encontrado para esta busca."
                  : "Nenhum contexto. Crie o programa (topo da hierarquia)."}
              </li>
            ) : (
              contextos.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <Link
                      href={`/contexto/${encodeURIComponent(c.id)}`}
                      className="font-medium text-brand-deep underline-offset-2 hover:underline"
                    >
                      {c.nome || "(sem nome)"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {c.projetosCount} projeto(s)
                      {c.inscricoesCount > 0
                        ? ` · ${c.inscricoesCount} inscrição(ões)`
                        : ""}
                      {!c.canEdit && !c.hasEditorAccess
                        ? " · somente leitura"
                        : !c.canDelete && (c.canEdit || c.hasEditorAccess)
                          ? " · exclusão bloqueada (há dados)"
                          : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {c.canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        onClick={() => openEditCtx(c)}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    ) : null}
                    {c.canEdit || c.canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-destructive"
                        disabled={pending || !c.canDelete}
                        title={
                          c.canDelete
                            ? "Excluir"
                            : "Há projetos ou inscrições vinculadas"
                        }
                        onClick={() => removeCtx(c.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Excluir
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
          <ListPager
            page={page}
            pageCount={pageCount}
            total={total}
            params={pagerParams}
          />
        </div>
      ) : null}

      {tab === "projetos" ? (
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
          <div className="hidden items-center gap-2 border-b border-border/60 bg-brand-mist/50 px-4 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto]">
            <SortableTableHead
              label="Contexto"
              sortKey="contexto"
              activeKey={sort}
              activeDir={sortDir}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Projeto"
              sortKey="nome"
              activeKey={sort}
              activeDir={sortDir}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="PRONAC"
              sortKey="pronac"
              activeKey={sort}
              activeDir={sortDir}
              onSort={toggleSort}
            />
            <span className="text-xs font-semibold text-brand-deep text-right">
              Ações
            </span>
          </div>
          <ul className="divide-y divide-border/60">
            {projetos.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {q
                  ? "Nenhum projeto encontrado para esta busca."
                  : "Nenhum projeto ainda. Inicie um projeto no MAX Origem ou cadastre via importação de planilha."}
              </li>
            ) : (
              projetos.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {p.contextoNome ? (
                        <Link
                          href={`/contexto/${encodeURIComponent(p.contextoId)}`}
                          className="underline-offset-2 hover:text-brand-deep hover:underline"
                        >
                          {p.contextoNome}
                        </Link>
                      ) : (
                        "(contexto)"
                      )}
                    </div>
                    <Link
                      href={`/projeto/${encodeURIComponent(p.id)}`}
                      className="font-medium text-brand-deep underline-offset-2 hover:underline"
                    >
                      {p.nome}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      PRONAC {p.pronac}
                      {p.ano ? ` · ${p.ano}` : ""} · {p.oficinasCount} oficina(s)
                      {p.inscricoesCount > 0
                        ? ` · ${p.inscricoesCount} inscrição(ões)`
                        : ""}
                      {!p.canEdit && !p.hasEditorAccess
                        ? " · somente leitura"
                        : !p.canDelete && (p.canEdit || p.hasEditorAccess)
                          ? " · exclusão bloqueada (há dados)"
                          : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {p.canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        onClick={() => openEditProj(p)}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    ) : null}
                    {p.canEdit || p.canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-destructive"
                        disabled={pending || !p.canDelete}
                        title={
                          p.canDelete
                            ? "Excluir"
                            : "Há oficinas ou inscrições vinculadas"
                        }
                        onClick={() => removeProj(p.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Excluir
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
          <ListPager
            page={page}
            pageCount={pageCount}
            total={total}
            params={pagerParams}
          />
        </div>
      ) : null}

      {tab === "oficinas" ? (
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
          <div className="hidden items-center gap-2 border-b border-border/60 bg-brand-mist/50 px-4 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
            <SortableTableHead
              label="Contexto / Projeto"
              sortKey="contexto"
              activeKey={sort}
              activeDir={sortDir}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Oficina"
              sortKey="nome"
              activeKey={sort}
              activeDir={sortDir}
              onSort={toggleSort}
            />
            <span className="text-xs font-semibold text-brand-deep text-right">
              Ações
            </span>
          </div>
          <ul className="divide-y divide-border/60">
            {oficinas.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {q
                  ? "Nenhuma oficina encontrada para esta busca."
                  : "Nenhuma oficina. Vincule a um projeto."}
              </li>
            ) : (
              oficinas.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {o.contextoNome ? (
                        <Link
                          href={`/contexto/${encodeURIComponent(o.contextoId)}`}
                          className="underline-offset-2 hover:text-brand-deep hover:underline"
                        >
                          {o.contextoNome}
                        </Link>
                      ) : (
                        "(contexto)"
                      )}
                      {" → "}
                      {o.projetoNome ? (
                        <Link
                          href={`/projeto/${encodeURIComponent(o.projetoId)}`}
                          className="underline-offset-2 hover:text-brand-deep hover:underline"
                        >
                          {o.projetoNome}
                        </Link>
                      ) : (
                        "(projeto)"
                      )}
                    </div>
                    <Link
                      href={`/projeto/${encodeURIComponent(o.projetoId)}/${encodeURIComponent(o.id)}`}
                      className="font-medium text-brand-deep underline-offset-2 hover:underline"
                    >
                      {o.nome}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {o.inscricoesCount > 0
                        ? `${o.inscricoesCount} inscrição(ões)`
                        : "Sem inscrições"}
                      {!o.canEdit && !o.hasEditorAccess
                        ? " · somente leitura"
                        : !o.canDelete && (o.canEdit || o.hasEditorAccess)
                          ? " · exclusão bloqueada (há dados)"
                          : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {o.canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        onClick={() => openEditOf(o)}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    ) : null}
                    {o.canEdit || o.canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-destructive"
                        disabled={pending || !o.canDelete}
                        title={
                          o.canDelete
                            ? "Excluir"
                            : "Há inscrições vinculadas"
                        }
                        onClick={() => removeOf(o.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Excluir
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
          <ListPager
            page={page}
            pageCount={pageCount}
            total={total}
            params={pagerParams}
          />
        </div>
      ) : null}

      <Dialog open={ctxOpen} onOpenChange={setCtxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ctxEditId ? "Editar contexto" : "Novo contexto"}
            </DialogTitle>
            <DialogDescription>
              Topo da hierarquia (programa). O nome é obrigatório.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="ctx-nome">Nome do contexto</Label>
            <Input
              id="ctx-nome"
              value={ctxNome}
              placeholder="Ex.: Arte em Rede"
              onChange={(e) => setCtxNome(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCtxOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || !ctxNome.trim()}
              onClick={saveCtx}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={projOpen} onOpenChange={setProjOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar projeto</DialogTitle>
            <DialogDescription>
              Mova o projeto para outro contexto (programa) ou ajuste metadados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Contexto</Label>
              <Input
                value={projCtxSearch}
                placeholder="Buscar contexto…"
                onChange={(e) => setProjCtxSearch(e.target.value)}
              />
              <Select
                value={projForm.contextoId || undefined}
                onValueChange={(v) =>
                  setProjForm((f) => ({ ...f, contextoId: v ?? "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {projContextos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome || "(sem nome)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome do projeto</Label>
              <Input
                value={projForm.nome}
                onChange={(e) =>
                  setProjForm((f) => ({ ...f, nome: e.target.value }))
                }
                placeholder="Ex.: Arte em Rede 1ª Edição"
              />
            </div>
            <div className="space-y-1.5">
              <Label>PRONAC</Label>
              <Input
                value={projForm.pronac}
                onChange={(e) =>
                  setProjForm((f) => ({ ...f, pronac: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Proponente</Label>
              <Input
                value={projForm.proponente}
                onChange={(e) =>
                  setProjForm((f) => ({ ...f, proponente: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input
                value={projForm.ano}
                inputMode="numeric"
                maxLength={4}
                onChange={(e) =>
                  setProjForm((f) => ({
                    ...f,
                    ano: e.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProjOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending} onClick={saveProj}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ofOpen} onOpenChange={setOfOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ofEditId ? "Editar oficina" : "Nova oficina"}
            </DialogTitle>
            <DialogDescription>
              A oficina fica vinculada a um único projeto (e ao contexto dele).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Contexto</Label>
              <Select
                value={ofForm.contextoId || undefined}
                onValueChange={(v) => {
                  const contextoId = v ?? "";
                  setOfForm((f) => ({
                    ...f,
                    contextoId,
                    projetoId: "",
                  }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ofContextos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome || "(sem nome)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select
                value={ofForm.projetoId || undefined}
                onValueChange={(v) =>
                  setOfForm((f) => ({ ...f, projetoId: v ?? "" }))
                }
                disabled={!ofForm.contextoId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ofProjetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.pronac ? `${p.nome} · ${p.pronac}` : p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome da oficina</Label>
              <Input
                value={ofForm.nome}
                onChange={(e) =>
                  setOfForm((f) => ({ ...f, nome: e.target.value }))
                }
                placeholder="Ex.: Oficina de IA"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOfOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending} onClick={saveOf}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
