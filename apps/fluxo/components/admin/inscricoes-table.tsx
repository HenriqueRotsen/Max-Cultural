"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Expand,
  Pencil,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { extractProjectYear } from "@/lib/normalize";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageLoading } from "@/components/page-loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LOTE_CONTEXT_COLUMNS, PERSON_COLUMNS } from "@/lib/column-map";
import type { SigaCulturalColumn, SigaCulturalRow } from "@/lib/schema";
import { columnLabel } from "@/lib/column-labels";
import { formatCellDisplay } from "@/lib/validate";
import type { ContextFilterOptions } from "@/app/actions/inscricoes";
import { EditInscricaoDialog } from "@/components/admin/edit-inscricao-dialog";
import { PhoneLink } from "@/components/phone-link";
import { StatusBadges } from "@/components/status-badges";
import { SortableTableHead } from "@/components/sortable-table-head";
import { toggleSortDir, type SortDir } from "@/lib/table-sort";

type Row = SigaCulturalRow & { id: string };

type Props = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: ContextFilterOptions;
};

const COL_SPAN = 8;

const PREVIEW_PERSON_COLS: SigaCulturalColumn[] = [
  "Data_inscricao",
  "E-mail",
  "Telefone",
  "Genero",
  "Etnia",
  "Data_nascimento",
  "idade_atual",
  "Cidade",
  "Estado",
  "Territorio",
  "Escolaridade",
  "Possui_deficiencia",
  "RestricaoAlimentar",
];

function FieldGrid({
  cols,
  row,
}: {
  cols: readonly SigaCulturalColumn[];
  row: Row;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cols.map((col) => {
        const value = row[col];
        const empty = value === null || value === undefined || value === "";
        const display = empty ? "—" : formatCellDisplay(col, value);
        return (
          <div key={col} className="min-w-0">
            <div className="text-xs text-muted-foreground">{columnLabel(col)}</div>
            <div className="text-sm font-medium break-words">
              {col === "Telefone" && !empty ? (
                <PhoneLink phone={value} label={display} />
              ) : (
                display
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadgesCell({ row }: { row: Row }) {
  return (
    <StatusBadges
      selecionado={row.Selecionados === 1}
      participante={row.Participantes === 1}
      certificado={row.Certificado === 1}
    />
  );
}

function projetoHref(row: Row) {
  return `/projeto/${encodeURIComponent(row.id_projeto)}`;
}

function oficinaHref(row: Row) {
  return `/projeto/${encodeURIComponent(row.id_projeto)}/${encodeURIComponent(row.id_oficina)}`;
}

export function InscricoesTable({
  rows,
  total,
  page,
  pageSize,
  totalPages,
  filterOptions,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null);
  const [extended, setExtended] = useState<Row | null>(null);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(true);

  const filterSelectItems = useMemo(
    () => ({
      projeto: {
        all: "Todos",
        ...Object.fromEntries(
          filterOptions.projetos.map((p) => [
            p.idProjeto,
            p.nomeProjeto || p.idProjeto,
          ]),
        ),
      },
      oficina: {
        all: "Todas",
        ...Object.fromEntries(
          filterOptions.oficinas.map((o) => [
            o.idOficina,
            o.nomeOficina || o.idOficina,
          ]),
        ),
      },
      proponente: {
        all: "Todos",
        ...Object.fromEntries(filterOptions.proponentes.map((p) => [p, p])),
      },
      pronac: {
        all: "Todos",
        ...Object.fromEntries(filterOptions.pronacs.map((p) => [p, p])),
      },
      ano: {
        all: "Todos",
        ...Object.fromEntries(filterOptions.anos.map((a) => [a, a])),
      },
      flag: {
        all: "Todos",
        "1": "Sim",
        "0": "Não",
      },
    }),
    [filterOptions],
  );

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  function updateParams(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in patch)) params.set("page", "1");
    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`);
    });
  }

  const sortKey = searchParams.get("sort") ?? "createdAt";
  const sortDir = (searchParams.get("sortDir") === "desc" ? "desc" : "asc") as SortDir;

  function toggleSort(key: string) {
    updateParams({
      sort: key,
      sortDir: toggleSortDir(sortKey, sortDir, key),
    });
  }

  function applySearch() {
    updateParams({ q: q.trim() });
  }

  function clearFilters() {
    setQ("");
    startTransition(() => {
      router.push("/dashboard");
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeFilterCount = [
    "idProjeto",
    "idOficina",
    "proponente",
    "pronac",
    "anoProjeto",
    "selecionados",
    "participantes",
  ].filter((k) => {
    const v = searchParams.get(k);
    return v && v !== "all";
  }).length;

  return (
    <div className="relative space-y-4">
      {pending ? (
        <div className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-white/70 pt-24 backdrop-blur-[1px]">
          <PageLoading label="Atualizando base…" className="min-h-0 py-0" />
        </div>
      ) : null}
      <div
        className={cn("space-y-4", pending && "pointer-events-none opacity-50")}
        aria-busy={pending}
      >
      {/* Busca */}
      <div className="rounded-2xl border border-brand/10 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="q">Busca</Label>
            <div className="flex gap-2">
              <Input
                id="q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nome, CPF, e-mail ou oficina"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applySearch();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-1.5"
                disabled={pending}
                onClick={applySearch}
              >
                <Search className="size-4" />
                Buscar
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal className="size-3.5" />
              Filtros
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="ml-0.5">
                  {activeFilterCount}
                </Badge>
              ) : null}
            </Button>
            {activeFilterCount > 0 || q ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
              >
                Limpar
              </Button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
          <div className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Projeto</Label>
              <Select
                value={searchParams.get("idProjeto") ?? "all"}
                onValueChange={(value) =>
                  updateParams({ idProjeto: value ?? "all", idOficina: "all" })
                }
                items={filterSelectItems.projeto}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.projetos.map((p) => (
                    <SelectItem key={p.idProjeto} value={p.idProjeto}>
                      {p.nomeProjeto || p.idProjeto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Oficina</Label>
              <Select
                value={searchParams.get("idOficina") ?? "all"}
                onValueChange={(value) =>
                  updateParams({ idOficina: value ?? "all" })
                }
                items={filterSelectItems.oficina}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filterOptions.oficinas.map((o) => (
                    <SelectItem key={o.idOficina} value={o.idOficina}>
                      {o.nomeOficina || o.idOficina}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Proponente</Label>
              <Select
                value={searchParams.get("proponente") ?? "all"}
                onValueChange={(value) =>
                  updateParams({ proponente: value ?? "all" })
                }
                items={filterSelectItems.proponente}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.proponentes.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">PRONAC</Label>
              <Select
                value={searchParams.get("pronac") ?? "all"}
                onValueChange={(value) =>
                  updateParams({ pronac: value ?? "all" })
                }
                items={filterSelectItems.pronac}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.pronacs.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ano do projeto</Label>
              <Select
                value={searchParams.get("anoProjeto") ?? "all"}
                onValueChange={(value) =>
                  updateParams({ anoProjeto: value ?? "all" })
                }
                items={filterSelectItems.ano}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.anos.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Selecionados</Label>
              <Select
                value={searchParams.get("selecionados") ?? "all"}
                onValueChange={(value) =>
                  updateParams({ selecionados: value ?? "all" })
                }
                items={filterSelectItems.flag}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="1">Sim</SelectItem>
                  <SelectItem value="0">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Participantes</Label>
              <Select
                value={searchParams.get("participantes") ?? "all"}
                onValueChange={(value) =>
                  updateParams({ participantes: value ?? "all" })
                }
                items={filterSelectItems.flag}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="1">Sim</SelectItem>
                  <SelectItem value="0">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded(new Set(rows.map((r) => r.id)))}
          >
            Expandir todos
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded(new Set())}
          >
            Recolher todos
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/export?format=csv"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Exportar CSV
          </a>
          <a
            href="/api/export?format=xlsx"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Exportar XLSX
          </a>
          <Link
            href="/dashboard/importar"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Nova importação
          </Link>
        </div>
      </div>

      {/* Tabela reduzida */}
      <div className="overflow-hidden rounded-xl border border-brand/10 bg-white/90 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>
                <SortableTableHead
                  label="Nome"
                  sortKey="nome"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortableTableHead
                  label="CPF"
                  sortKey="cpf"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortableTableHead
                  label="Projeto"
                  sortKey="projeto"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortableTableHead
                  label="Oficina"
                  sortKey="oficina"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortableTableHead
                  label="Cidade/UF"
                  sortKey="cidade"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COL_SPAN}
                  className="py-10 text-center text-muted-foreground"
                >
                  {pending ? "Carregando…" : "Nenhum registro na base ainda."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const open = expanded.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggleExpand(row.id)}
                    >
                      <TableCell className="w-10">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="size-8 p-0"
                          aria-label={open ? "Recolher" : "Expandir"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(row.id);
                          }}
                        >
                          {open ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="max-w-[12rem] font-medium">
                        <span className="line-clamp-2">{row.Nome}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {row.CPF ? (
                          <Link
                            href={`/pessoa/${row.CPF.replace(/\D/g, "")}`}
                            className="text-brand-deep underline-offset-2 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {formatCellDisplay("CPF", row.CPF) || "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[14rem]">
                        <Link
                          href={projetoHref(row)}
                          className="block underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="line-clamp-2 text-sm font-medium text-brand-deep">
                            {row.Nome_projeto || "—"}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[12rem]">
                        <Link
                          href={oficinaHref(row)}
                          className="block underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="line-clamp-2 text-sm font-medium text-brand-deep">
                            {row.Nome_oficina || "—"}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {row.Cidade}
                        {row.Estado ? `/${row.Estado}` : ""}
                        {!row.Cidade && !row.Estado ? "—" : ""}
                      </TableCell>
                      <TableCell>
                        <StatusBadgesCell row={row} />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(row);
                          }}
                        >
                          <Pencil className="size-3.5" />
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>

                    {open ? (
                      <TableRow className="bg-brand-mist/30 hover:bg-brand-mist/30">
                        <TableCell
                          colSpan={COL_SPAN}
                          className="whitespace-normal p-4"
                        >
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                Resumo
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExtended(row);
                                  }}
                                >
                                  <Expand className="size-3.5" />
                                  Aba extendida
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditing(row);
                                  }}
                                >
                                  Editar registro
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-4 rounded-xl border border-brand/10 bg-white/80 p-4 sm:grid-cols-2 lg:grid-cols-4">
                              <div className="min-w-0">
                                <div className="text-xs text-muted-foreground">
                                  Projeto
                                </div>
                                <Link
                                  href={projetoHref(row)}
                                  className="block text-sm font-medium break-words text-brand-deep underline-offset-2 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {row.Nome_projeto || "—"}
                                </Link>
                              </div>
                              <div className="min-w-0 sm:col-span-1 lg:col-span-1">
                                <div className="text-xs text-muted-foreground">
                                  Oficina
                                </div>
                                <Link
                                  href={oficinaHref(row)}
                                  className="block text-sm font-medium break-words text-brand-deep underline-offset-2 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {row.Nome_oficina || "—"}
                                </Link>
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs text-muted-foreground">
                                  Proponente / PRONAC
                                </div>
                                <div className="text-sm font-medium break-words">
                                  {[row.PROPONENTE, row.PRONAC]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs text-muted-foreground">
                                  Ano
                                </div>
                                <div className="text-sm font-medium break-words">
                                  {extractProjectYear(row.Identificacao_ano_projeto) ||
                                    row.Identificacao_ano_projeto ||
                                    "—"}
                                </div>
                              </div>
                            </div>

                            <FieldGrid cols={PREVIEW_PERSON_COLS} row={row} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <EditInscricaoDialog
        open={Boolean(editing)}
        record={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />

      <Dialog
        open={Boolean(extended)}
        onOpenChange={(open) => {
          if (!open) setExtended(null);
        }}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12 text-left">
            <DialogTitle className="font-heading text-xl">
              {extended?.Nome || "Registro"}
            </DialogTitle>
            <DialogDescription>
              Visão completa do registro — contexto, pessoa e status.
            </DialogDescription>
          </DialogHeader>

          {extended ? (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-5 py-5">
              <section className="space-y-3">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Contexto do lote
                </h3>
                <FieldGrid cols={LOTE_CONTEXT_COLUMNS} row={extended} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href={projetoHref(extended)}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Ver projeto
                  </Link>
                  <Link
                    href={oficinaHref(extended)}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Ver oficina
                  </Link>
                  {extended.CPF ? (
                    <Link
                      href={`/pessoa/${extended.CPF.replace(/\D/g, "")}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      Ver pessoa
                    </Link>
                  ) : null}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Dados da pessoa
                </h3>
                <FieldGrid cols={PERSON_COLUMNS} row={extended} />
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {total} registro(s) · página {page} de {totalPages}
          {pageSize ? ` · ${pageSize}/página` : ""}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || pending}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || pending}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Próxima
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
