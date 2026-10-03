"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { auditActionLabel, auditScreenLabel } from "@/lib/audit-labels";
import {
  LOGS_PAGE_SIZE_OPTIONS,
  logsQueryToSearchParams,
  type LogRowDTO,
  type LogsQuery,
  type LogsSortKey,
} from "@/lib/logs-query";

type ActorOption = { id: string; email: string; name: string | null };
type FilterOptions = {
  actions: string[];
  screens: string[];
  entityTypes: string[];
  actors: ActorOption[];
};

type Props = {
  logs: LogRowDTO[];
  total: number;
  query: LogsQuery;
  filterOptions: FilterOptions;
};

function SortHeader({
  label,
  column,
  query,
}: {
  label: string;
  column: LogsSortKey;
  query: LogsQuery;
}) {
  const active = query.sort === column;
  const dir: "asc" | "desc" = active
    ? query.dir === "asc"
      ? "desc"
      : "asc"
    : column === "createdAt"
      ? "desc"
      : "asc";
  const qs = logsQueryToSearchParams(query, {
    sort: column,
    dir,
    page: 1,
  });
  const arrow = !active ? "↕" : query.dir === "asc" ? "↑" : "↓";
  return (
    <Link
      href={`/logs?${qs.toString()}`}
      className={`inline-flex items-center gap-1 font-semibold ${
        active ? "text-[var(--navy)]" : "text-[var(--gray-500)]"
      } hover:text-[var(--navy)]`}
      title={`Ordenar por ${label}`}
    >
      {label}
      <span className="text-[10px] opacity-70" aria-hidden>
        {arrow}
      </span>
    </Link>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--gray-400)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[var(--navy)]">{children}</dd>
    </div>
  );
}

function LogDetailDialog({
  log,
  onClose,
}: {
  log: LogRowDTO;
  onClose: () => void;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
              Auditoria
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-[var(--navy)]">
              Detalhe do log
            </h2>
            <p className="mt-0.5 text-sm text-[var(--gray-500)]">
              {auditActionLabel(log.action)}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost shrink-0 px-3 py-1.5 text-sm"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Quando">
              {new Date(log.createdAt).toLocaleString("pt-BR")}
            </DetailField>
            <DetailField label="IP">{log.ip || "—"}</DetailField>
            <DetailField label="Ação">
              <div className="font-medium">{auditActionLabel(log.action)}</div>
              <code className="mt-0.5 block text-[11px] text-[var(--gray-500)]">
                {log.action}
              </code>
            </DetailField>
            <DetailField label="Quem">
              <div className="font-medium">{log.actorName || "—"}</div>
              {log.actorEmail ? (
                <div className="text-xs text-[var(--gray-500)]">{log.actorEmail}</div>
              ) : null}
            </DetailField>
            <DetailField label="Tela">{auditScreenLabel(log.screen)}</DetailField>
            <DetailField label="Entidade">
              {log.entityType || "—"}
              {log.entityId ? (
                <div className="mt-0.5 break-all text-xs text-[var(--gray-500)]">
                  {log.entityId}
                </div>
              ) : null}
            </DetailField>
            <DetailField label="ID do log">
              <code className="break-all text-[11px] text-[var(--gray-500)]">
                {log.id}
              </code>
            </DetailField>
            {log.actorUserId ? (
              <DetailField label="ID do usuário">
                <code className="break-all text-[11px] text-[var(--gray-500)]">
                  {log.actorUserId}
                </code>
              </DetailField>
            ) : null}
          </dl>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--gray-400)]">
              Metadados
            </p>
            <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-[var(--gray-50)] p-3 text-[11px] leading-relaxed text-[var(--gray-600)]">
              {log.meta != null
                ? JSON.stringify(log.meta, null, 2)
                : "Sem metadados adicionais."}
            </pre>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function LogsExplorer({ logs, total, query, filterOptions }: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState<LogRowDTO | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      query.action ||
        query.screen ||
        query.actorId ||
        query.entityType ||
        query.from ||
        query.to,
    ),
  );

  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const fromIdx = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const toIdx = Math.min(query.page * query.pageSize, total);

  const exportHref = useMemo(() => {
    const qs = logsQueryToSearchParams({ ...query, page: 1 });
    qs.delete("page");
    qs.delete("sort");
    qs.delete("dir");
    qs.delete("pageSize");
    return `/logs/export?${qs.toString()}`;
  }, [query]);

  const activeFilterCount = [
    query.action,
    query.screen,
    query.actorId,
    query.entityType,
    query.from,
    query.to,
  ].filter(Boolean).length;

  const goPage = useCallback(
    (page: number) => {
      const qs = logsQueryToSearchParams(query, { page });
      router.push(`/logs?${qs.toString()}`);
    },
    [query, router],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
            Acesso
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Logs</h1>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            Trilha central: autenticação, IAM do hub e eventos do Origem/Fluxo.
          </p>
        </div>
        <a href={exportHref} className="btn btn-ghost text-sm">
          Exportar CSV
        </a>
      </div>

      <form className="card space-y-3 p-4" method="get">
        <input type="hidden" name="sort" value={query.sort} />
        <input type="hidden" name="dir" value={query.dir} />
        <input type="hidden" name="pageSize" value={String(query.pageSize)} />
        {!filtersOpen ? (
          <>
            {query.action ? (
              <input type="hidden" name="action" value={query.action} />
            ) : null}
            {query.screen ? (
              <input type="hidden" name="screen" value={query.screen} />
            ) : null}
            {query.actorId ? (
              <input type="hidden" name="actor" value={query.actorId} />
            ) : null}
            {query.entityType ? (
              <input type="hidden" name="entityType" value={query.entityType} />
            ) : null}
            {query.from ? (
              <input type="hidden" name="from" value={query.from} />
            ) : null}
            {query.to ? <input type="hidden" name="to" value={query.to} /> : null}
          </>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="field min-w-0 flex-1">
            <span>Busca inteligente</span>
            <input
              name="q"
              defaultValue={query.qInput}
              placeholder="texto, e-mail, IP, auth.login, 02/10/2026…"
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn">
              Buscar
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              Filtros
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {activeFilterCount > 0 || query.qInput ? (
              <Link href="/logs" className="btn btn-ghost">
                Limpar
              </Link>
            ) : null}
          </div>
        </div>

        {query.smartHints.length > 0 ? (
          <p className="text-xs text-[var(--gray-500)]">
            Detectado: {query.smartHints.join(" · ")}
          </p>
        ) : (
          <p className="text-xs text-[var(--gray-400)]">
            Digite um e-mail, IP, código de ação (ex.: auth.login) ou data
            (dd/mm/aaaa) para filtrar automaticamente.
          </p>
        )}

        {filtersOpen ? (
          <div className="grid gap-3 border-t border-[var(--border)] pt-3 md:grid-cols-3 lg:grid-cols-6">
            <label className="field md:col-span-2">
              <span>Ação</span>
              <select name="action" defaultValue={query.action}>
                <option value="">Todas</option>
                {filterOptions.actions.map((a) => (
                  <option key={a} value={a}>
                    {auditActionLabel(a)} ({a})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tela</span>
              <select name="screen" defaultValue={query.screen}>
                <option value="">Todas</option>
                {filterOptions.screens.map((s) => (
                  <option key={s} value={s}>
                    {auditScreenLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Usuário</span>
              <select name="actor" defaultValue={query.actorId}>
                <option value="">Todos</option>
                {filterOptions.actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ? `${a.name} · ` : ""}
                    {a.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tipo entidade</span>
              <select name="entityType" defaultValue={query.entityType}>
                <option value="">Todos</option>
                {filterOptions.entityTypes.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>De</span>
              <input type="date" name="from" defaultValue={query.from} />
            </label>
            <label className="field">
              <span>Até</span>
              <input type="date" name="to" defaultValue={query.to} />
            </label>
            <div className="flex items-end md:col-span-3 lg:col-span-6">
              <button type="submit" className="btn btn-ghost">
                Aplicar filtros
              </button>
            </div>
          </div>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--gray-500)]">
        <p>
          {total === 0
            ? "Nenhum evento"
            : `Mostrando ${fromIdx}–${toIdx} de ${total}`}
        </p>
        <label className="inline-flex items-center gap-2">
          <span className="text-xs">Por página</span>
          <select
            className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-sm"
            value={query.pageSize}
            onChange={(e) => {
              const qs = logsQueryToSearchParams(
                { ...query, pageSize: Number(e.target.value), page: 1 },
                { page: 1 },
              );
              qs.set("pageSize", e.target.value);
              router.push(`/logs?${qs.toString()}`);
            }}
          >
            {LOGS_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th>
                  <SortHeader label="Quando" column="createdAt" query={query} />
                </th>
                <th>
                  <SortHeader label="Quem" column="actor" query={query} />
                </th>
                <th>
                  <SortHeader label="Ação" column="action" query={query} />
                </th>
                <th>
                  <SortHeader label="Tela" column="screen" query={query} />
                </th>
                <th>
                  <SortHeader label="Entidade" column="entity" query={query} />
                </th>
                <th>
                  <SortHeader label="IP" column="ip" query={query} />
                </th>
                <th className="text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--gray-500)]">
                    Nenhum evento encontrado.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap tabular-nums">
                      {new Date(log.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td>
                      <div className="font-medium text-[var(--navy)]">
                        {log.actorName ?? "—"}
                      </div>
                      <div className="text-xs text-[var(--gray-500)]">
                        {log.actorEmail ?? ""}
                      </div>
                    </td>
                    <td>
                      <div className="font-medium text-[var(--navy)]">
                        {auditActionLabel(log.action)}
                      </div>
                      <code className="text-[10px] text-[var(--gray-500)]">
                        {log.action}
                      </code>
                    </td>
                    <td>{auditScreenLabel(log.screen)}</td>
                    <td className="max-w-[10rem] truncate text-xs">
                      {[log.entityType, log.entityId].filter(Boolean).join(" · ") ||
                        "—"}
                    </td>
                    <td className="whitespace-nowrap text-xs">{log.ip || "—"}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-ghost px-2.5 py-1 text-xs"
                        onClick={() => setDetail(log)}
                      >
                        Detalhe
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={query.page <= 1}
            onClick={() => goPage(query.page - 1)}
          >
            ← Anterior
          </button>
          <p className="text-sm text-[var(--gray-500)]">
            Página {query.page} de {pageCount}
          </p>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={query.page >= pageCount}
            onClick={() => goPage(query.page + 1)}
          >
            Próxima →
          </button>
        </div>
      ) : null}

      {detail ? (
        <LogDetailDialog log={detail} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  );
}
