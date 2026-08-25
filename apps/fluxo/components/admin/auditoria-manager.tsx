"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Download,
  Eye,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import {
  exportAuditLogsAction,
  listAuditLogsAction,
  type AuditLogDTO,
  type AuditLogFilters,
} from "@/app/actions/acesso";
import {
  AUDIT_ACTION_GROUPS,
  auditActionLabel,
  describeAuditEvent,
} from "@/lib/audit-labels";
import { Badge } from "@/components/ui/badge";
import { SortableTableHead } from "@/components/sortable-table-head";
import { compareSortValues, toggleSortDir, type SortDir } from "@/lib/table-sort";
import { Button } from "@/components/ui/button";
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

type FilterOptions = {
  actions: string[];
  entityTypes: string[];
  actors: Array<{ id: string; name: string; email: string }>;
};

type Props = {
  initialLogs: AuditLogDTO[];
  initialTotal: number;
  filterOptions: FilterOptions;
};

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
  const s =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(logs: AuditLogDTO[]): string {
  const header = [
    "quando",
    "acao",
    "acao_rotulo",
    "ator",
    "email",
    "entidade_tipo",
    "entidade_id",
    "ip",
    "meta",
    "descricao",
  ];
  const lines = logs.map((l) =>
    [
      new Date(l.createdAt).toLocaleString("pt-BR"),
      l.action,
      auditActionLabel(l.action),
      l.actorName,
      l.actorEmail,
      l.entityType,
      l.entityId,
      l.ip ?? "",
      l.meta ? JSON.stringify(l.meta) : "",
      describeAuditEvent(l),
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export function AuditoriaManager({
  initialLogs,
  initialTotal,
  filterOptions,
}: Props) {
  const [logs, setLogs] = useState(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [pending, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<AuditLogDTO | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const [q, setQ] = useState("");
  const [actionPrefix, setActionPrefix] = useState("all");
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sortedLogs = useMemo(() => {
    const list = [...logs];
    list.sort((a, b) => {
      const pick = (log: AuditLogDTO): string | number => {
        switch (sortKey) {
          case "actor":
            return log.actorName || log.actorEmail;
          case "action":
            return log.action;
          case "entity":
            return `${log.entityType} ${log.entityId}`;
          case "createdAt":
          default:
            return new Date(log.createdAt).getTime();
        }
      };
      return compareSortValues(pick(a), pick(b), sortDir);
    });
    return list;
  }, [logs, sortKey, sortDir]);

  function toggleSort(key: string) {
    setSortDir((prev) => toggleSortDir(sortKey, prev, key));
    setSortKey(key);
  }

  const groupItems = useMemo(
    () =>
      Object.fromEntries(AUDIT_ACTION_GROUPS.map((g) => [g.value, g.label])),
    [],
  );
  const actionItems = useMemo(
    () =>
      Object.fromEntries([
        ["all", "Todas as ações"],
        ...filterOptions.actions.map((a) => [a, auditActionLabel(a)]),
      ]),
    [filterOptions.actions],
  );
  const entityItems = useMemo(
    () =>
      Object.fromEntries([
        ["all", "Todas"],
        ...filterOptions.entityTypes.map((e) => [e, e]),
      ]),
    [filterOptions.entityTypes],
  );
  const actorItems = useMemo(
    () =>
      Object.fromEntries([
        ["all", "Todos"],
        ...filterOptions.actors.map((a) => [
          a.id,
          `${a.name} (${a.email})`,
        ]),
      ]),
    [filterOptions.actors],
  );

  const activeFilterCount = [
    actionPrefix !== "all",
    action !== "all",
    entityType !== "all",
    actorId !== "all",
    Boolean(from),
    Boolean(to),
  ].filter(Boolean).length;

  function currentFilters(): AuditLogFilters {
    const prefix =
      actionPrefix === "all"
        ? undefined
        : AUDIT_ACTION_GROUPS.find((g) => g.value === actionPrefix)?.prefix;
    return {
      q: q.trim() || undefined,
      actionPrefix: action === "all" ? prefix : undefined,
      action: action === "all" ? undefined : action,
      entityType: entityType === "all" ? undefined : entityType,
      actorId: actorId === "all" ? undefined : actorId,
      from: from || undefined,
      to: to || undefined,
      take: 300,
    };
  }

  function applyFilters() {
    startTransition(async () => {
      try {
        const result = await listAuditLogsAction(currentFilters());
        setLogs(result.logs);
        setTotal(result.total);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Falha ao filtrar auditoria",
        );
      }
    });
  }

  function clearFilters() {
    setQ("");
    setActionPrefix("all");
    setAction("all");
    setEntityType("all");
    setActorId("all");
    setFrom("");
    setTo("");
    startTransition(async () => {
      const result = await listAuditLogsAction({ take: 200 });
      setLogs(result.logs);
      setTotal(result.total);
    });
  }

  function doExport(format: "csv" | "json") {
    startTransition(async () => {
      const r = await exportAuditLogsAction({
        ...currentFilters(),
        take: 5000,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      if (format === "csv") {
        downloadBlob(
          `auditoria-${stamp}.csv`,
          toCsv(r.logs),
          "text/csv;charset=utf-8",
        );
      } else {
        downloadBlob(
          `auditoria-${stamp}.json`,
          JSON.stringify(
            {
              exportedAt: r.exportedAt,
              totalMatched: r.total,
              count: r.logs.length,
              logs: r.logs.map((l) => ({
                ...l,
                label: auditActionLabel(l.action),
                description: describeAuditEvent(l),
              })),
            },
            null,
            2,
          ),
          "application/json",
        );
      }
      setExportOpen(false);
      toast.success(
        r.total > r.logs.length
          ? `Exportados ${r.logs.length} de ${r.total} eventos`
          : `${r.logs.length} evento(s) exportado(s)`,
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand/10 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="audit-q">Busca</Label>
            <div className="flex gap-2">
              <Input
                id="audit-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ação, usuário, e-mail, entidade ou IP"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyFilters();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-1.5"
                disabled={pending}
                onClick={applyFilters}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setExportOpen(true)}
            >
              <Download className="size-3.5" />
              Exportar
            </Button>
            {activeFilterCount > 0 || q ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={clearFilters}
              >
                Limpar
              </Button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
          <div className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select
                value={actionPrefix}
                onValueChange={(v) => {
                  setActionPrefix(v ?? "all");
                  setAction("all");
                }}
                items={groupItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_ACTION_GROUPS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ação</Label>
              <Select
                value={action}
                onValueChange={(v) => setAction(v ?? "all")}
                items={actionItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  {filterOptions.actions
                    .filter((a) => {
                      if (actionPrefix === "all") return true;
                      const prefix = AUDIT_ACTION_GROUPS.find(
                        (g) => g.value === actionPrefix,
                      )?.prefix;
                      return prefix ? a.startsWith(prefix) : true;
                    })
                    .map((a) => (
                      <SelectItem key={a} value={a}>
                        {auditActionLabel(a)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Usuário</Label>
              <Select
                value={actorId}
                onValueChange={(v) => setActorId(v ?? "all")}
                items={actorItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.actors.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de entidade</Label>
              <Select
                value={entityType}
                onValueChange={(v) => setEntityType(v ?? "all")}
                items={entityItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filterOptions.entityTypes.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="audit-from">
                De
              </Label>
              <Input
                id="audit-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="audit-to">
                Até
              </Label>
              <Input
                id="audit-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={applyFilters}
              >
                Aplicar filtros
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Mostrando {logs.length}
        {total > logs.length ? ` de ${total}` : ""} evento(s)
        {pending ? " · atualizando…" : ""}
      </p>

      <div className="overflow-hidden rounded-xl border bg-white/90">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-brand-mist/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">
                <SortableTableHead
                  label="Quando"
                  sortKey="createdAt"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
              </th>
              <th className="px-3 py-2">
                <SortableTableHead
                  label="Quem"
                  sortKey="actor"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
              </th>
              <th className="px-3 py-2">
                <SortableTableHead
                  label="Ação"
                  sortKey="action"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
              </th>
              <th className="px-3 py-2">
                <SortableTableHead
                  label="Entidade"
                  sortKey="entity"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
              </th>
              <th className="px-3 py-2 font-medium"> </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedLogs.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-2">
                  {l.actorName}
                  {l.actorEmail ? (
                    <div className="text-xs text-muted-foreground">
                      {l.actorEmail}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-brand-deep">
                    {auditActionLabel(l.action)}
                  </div>
                  <div className="text-xs text-muted-foreground">{l.action}</div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {[l.entityType, l.entityId].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setDetail(l)}
                  >
                    <Eye className="size-3.5" />
                    Detalhe
                  </Button>
                </td>
              </tr>
            ))}
            {sortedLogs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Nenhum evento encontrado com esses filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhe do evento</DialogTitle>
            <DialogDescription>
              Visão completa do registro de auditoria.
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="max-h-[70vh] space-y-4 overflow-y-auto text-sm">
              <p className="rounded-lg border border-brand/15 bg-brand-soft/30 px-3 py-2 text-brand-deep">
                {describeAuditEvent(detail)}
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Quando</dt>
                  <dd className="font-medium">
                    {new Date(detail.createdAt).toLocaleString("pt-BR")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">IP</dt>
                  <dd className="font-medium">{detail.ip || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Ação</dt>
                  <dd className="font-medium">
                    {auditActionLabel(detail.action)}
                    <div className="text-xs font-normal text-muted-foreground">
                      {detail.action}
                    </div>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Autor</dt>
                  <dd className="font-medium">
                    {detail.actorName}
                    {detail.actorEmail ? (
                      <div className="text-xs font-normal text-muted-foreground">
                        {detail.actorEmail}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Entidade</dt>
                  <dd className="font-medium">
                    {detail.entityType || "—"}
                    {detail.entityId ? (
                      <div className="break-all text-xs font-normal text-muted-foreground">
                        {detail.entityId}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">ID do log</dt>
                  <dd className="break-all text-xs font-mono text-muted-foreground">
                    {detail.id}
                  </dd>
                </div>
              </dl>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Metadados (dados adicionais)
                </p>
                <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
                  {detail.meta
                    ? JSON.stringify(detail.meta, null, 2)
                    : "Sem metadados adicionais."}
                </pre>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetail(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar relatório</DialogTitle>
            <DialogDescription>
              Exporta os eventos com os filtros atuais (até 5.000 registros).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button
              type="button"
              disabled={pending}
              className="justify-start gap-2"
              onClick={() => doExport("csv")}
            >
              <Download className="size-4" />
              Exportar CSV (planilha)
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              className="justify-start gap-2"
              onClick={() => doExport("json")}
            >
              <Download className="size-4" />
              Exportar JSON (detalhado)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
