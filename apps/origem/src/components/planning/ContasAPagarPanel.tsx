"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { FilterSearchSelect } from "@/components/ui/FilterSearchSelect";
import {
  DEFAULT_CONTAS_FILTERS,
  contasAPagarFiltersToSearchParams,
  contasAPagarSortDirection,
  filterAndSortContasAPagar,
  toggleContasAPagarSort,
  type ContasAPagarDueFilter,
  type ContasAPagarFilters,
  type ContasAPagarRow,
  type ContasAPagarSort,
} from "@/lib/planning/contas-a-pagar";
import { summarizePaymentDeadlines } from "@/lib/planning/payment-alerts";

function SortHeader({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: "due" | "amount" | "project" | "supplier" | "rubric" | "origin";
  sort: ContasAPagarSort;
  onSort: (
    column: "due" | "amount" | "project" | "supplier" | "rubric" | "origin",
  ) => void;
  align?: "left" | "right";
}) {
  const dir = contasAPagarSortDirection(sort, column);
  return (
    <th
      className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-[var(--navy)] ${
          dir ? "text-[var(--navy)]" : ""
        } ${align === "right" ? "ml-auto" : ""}`}
        onClick={() => onSort(column)}
      >
        {label}
        <span className="text-[10px] tabular-nums" aria-hidden>
          {dir === "asc" ? "↑" : dir === "desc" ? "↓" : "↕"}
        </span>
      </button>
    </th>
  );
}

function DueChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-[var(--navy)] text-white"
          : "bg-[var(--gray-100)] text-[var(--gray-600)] hover:bg-[var(--gray-200)]"
      }`}
    >
      {children}
    </button>
  );
}

export function ContasAPagarPanel({
  rows,
  dueSoonDays,
  initialDue = "all",
  highlightCommitmentId = null,
}: {
  rows: ContasAPagarRow[];
  /** Dias da preferência de avisos (PAYMENT_DUE_SOON). */
  dueSoonDays: number;
  initialDue?: ContasAPagarDueFilter;
  highlightCommitmentId?: string | null;
}) {
  const [filters, setFilters] = useState<ContasAPagarFilters>(() => ({
    ...DEFAULT_CONTAS_FILTERS,
    due: initialDue,
  }));
  const [moreOpen, setMoreOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(
        r.planningProjectId,
        r.projectName ? `${r.externalCode} — ${r.projectName}` : r.externalCode,
      );
    }
    return [...map.entries()]
      .map(([id, label]) => ({ value: id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [rows]);

  const suppliers = useMemo(() => {
    const set = new Set(rows.map((r) => r.supplierName));
    return [...set]
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((name) => ({ value: name, label: name }));
  }, [rows]);

  const originOptions = [
    { value: "all", label: "Pedidos e reservas" },
    { value: "pedido", label: "Só pedidos" },
    { value: "reserva", label: "Só reservas" },
  ];

  const deadlines = useMemo(
    () =>
      summarizePaymentDeadlines(rows, {
        dueSoonDays,
      }),
    [rows, dueSoonDays],
  );

  const filtered = useMemo(
    () => filterAndSortContasAPagar(rows, filters, new Date(), dueSoonDays),
    [rows, filters, dueSoonDays],
  );

  useEffect(() => {
    if (!highlightCommitmentId) return;
    const el = document.getElementById(`commitment-${highlightCommitmentId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightCommitmentId, filtered.length]);

  const total = useMemo(
    () => filtered.reduce((s, r) => s + r.amount, 0),
    [filtered],
  );
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const hasExtraFilters =
    filters.origin !== "all" || Boolean(filters.from) || Boolean(filters.to);
  const hasAnyFilter =
    Boolean(filters.query.trim()) ||
    Boolean(filters.projectId) ||
    Boolean(filters.supplier) ||
    filters.due !== "all" ||
    hasExtraFilters;

  function patch(partial: Partial<ContasAPagarFilters>) {
    setFilters((prev) => ({ ...prev, ...partial }));
  }

  function onSort(
    column: "due" | "amount" | "project" | "supplier" | "rubric" | "origin",
  ) {
    setFilters((prev) => ({
      ...prev,
      sort: toggleContasAPagarSort(prev.sort, column),
    }));
  }

  function generatePdf() {
    const qs = contasAPagarFiltersToSearchParams(filters);
    qs.set("days", String(dueSoonDays));
    startTransition(() => {
      window.location.href = `/api/planning/contas-a-pagar?${qs.toString()}`;
    });
  }

  return (
    <div className="space-y-5">
      {(deadlines.overdueCount > 0 || deadlines.upcomingCount > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {deadlines.overdueCount > 0 ? (
            <button
              type="button"
              onClick={() => patch({ due: "overdue" })}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                filters.due === "overdue"
                  ? "border-red-300 bg-red-50"
                  : "border-red-200 bg-red-50/70 hover:bg-red-50"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Em atraso
              </p>
              <p className="mt-1 text-sm font-semibold text-red-900">
                {deadlines.overdueCount}{" "}
                {deadlines.overdueCount === 1 ? "pagamento" : "pagamentos"} ·{" "}
                {formatCurrency(deadlines.overdueAmount)}
              </p>
            </button>
          ) : null}
          {deadlines.upcomingCount > 0 ? (
            <button
              type="button"
              onClick={() => patch({ due: "upcoming" })}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                filters.due === "upcoming"
                  ? "border-amber-300 bg-amber-50"
                  : "border-amber-200 bg-amber-50/70 hover:bg-amber-50"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Vence em até {deadlines.dueSoonDays}{" "}
                {deadlines.dueSoonDays === 1 ? "dia" : "dias"}
              </p>
              <p className="mt-1 text-sm font-semibold text-amber-950">
                {deadlines.upcomingCount}{" "}
                {deadlines.upcomingCount === 1 ? "pagamento" : "pagamentos"} ·{" "}
                {formatCurrency(deadlines.upcomingAmount)}
              </p>
            </button>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DueChip
            active={filters.due === "all"}
            onClick={() => patch({ due: "all" })}
          >
            Todos
          </DueChip>
          <DueChip
            active={filters.due === "overdue"}
            onClick={() => patch({ due: "overdue" })}
          >
            Vencidos
            {deadlines.overdueCount > 0 ? ` (${deadlines.overdueCount})` : ""}
          </DueChip>
          <DueChip
            active={filters.due === "upcoming"}
            onClick={() => patch({ due: "upcoming" })}
          >
            Próximos {dueSoonDays} dias
            {deadlines.upcomingCount > 0 ? ` (${deadlines.upcomingCount})` : ""}
          </DueChip>
          <DueChip
            active={filters.due === "later"}
            onClick={() => patch({ due: "later" })}
          >
            Depois
          </DueChip>
        </div>
        <button
          type="button"
          className="btn shrink-0"
          disabled={pending || filtered.length === 0}
          onClick={generatePdf}
        >
          {pending ? "Gerando…" : "Gerar relatório"}
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="field min-w-0 flex-1 !mb-0">
          <span className="sr-only">Buscar</span>
          <input
            type="search"
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Buscar projeto, fornecedor ou rubrica…"
          />
        </label>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <FilterSearchSelect
            value={filters.projectId}
            options={projects}
            onChange={(projectId) => patch({ projectId })}
            placeholder="Buscar projeto…"
            emptyLabel="Todos os projetos"
          />
          <FilterSearchSelect
            value={filters.supplier}
            options={suppliers}
            onChange={(supplier) => patch({ supplier })}
            placeholder="Buscar fornecedor…"
            emptyLabel="Todos os fornecedores"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <button
          type="button"
          className="font-medium text-[var(--navy)] hover:underline"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
        >
          {moreOpen ? "Ocultar filtros" : "Mais filtros"}
          {hasExtraFilters && !moreOpen ? " · ativos" : ""}
        </button>
        {hasAnyFilter ? (
          <button
            type="button"
            className="text-[var(--gray-500)] hover:text-[var(--navy)] hover:underline"
            onClick={() => {
              setFilters(DEFAULT_CONTAS_FILTERS);
              setMoreOpen(false);
            }}
          >
            Limpar
          </button>
        ) : null}
        <p className="ml-auto tabular-nums text-[var(--gray-500)]">
          <span className="font-semibold text-[var(--navy)]">
            {filtered.length}
          </span>{" "}
          {filtered.length === 1 ? "item" : "itens"} ·{" "}
          <span className="font-semibold text-[var(--navy)]">
            {formatCurrency(total)}
          </span>
        </p>
      </div>

      {moreOpen ? (
        <div className="grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-3">
          <div className="field !mb-0">
            <span className="text-xs text-[var(--gray-500)]">Origem</span>
            <FilterSearchSelect
              value={filters.origin}
              options={originOptions}
              onChange={(origin) =>
                patch({
                  origin: (origin || "all") as ContasAPagarFilters["origin"],
                })
              }
              placeholder="Buscar…"
              allowEmpty={false}
            />
          </div>
          <label className="field !mb-0">
            <span className="text-xs text-[var(--gray-500)]">De</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => patch({ from: e.target.value })}
            />
          </label>
          <label className="field !mb-0">
            <span className="text-xs text-[var(--gray-500)]">Até</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => patch({ to: e.target.value })}
            />
          </label>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--gray-500)]">
          Nenhum compromisso com os filtros atuais.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--gray-50)] text-xs uppercase tracking-wide text-[var(--gray-500)]">
              <tr>
                <SortHeader
                  label="Vencimento"
                  column="due"
                  sort={filters.sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="Projeto"
                  column="project"
                  sort={filters.sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="Fornecedor"
                  column="supplier"
                  sort={filters.sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="Rubrica"
                  column="rubric"
                  sort={filters.sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="Valor"
                  column="amount"
                  sort={filters.sort}
                  onSort={onSort}
                  align="right"
                />
                <SortHeader
                  label="Origem"
                  column="origin"
                  sort={filters.sort}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const due = new Date(c.expectedPayAt);
                due.setHours(0, 0, 0, 0);
                const overdue = due < today;
                const upcomingLimit = new Date(today);
                upcomingLimit.setDate(upcomingLimit.getDate() + dueSoonDays);
                const dueSoon = !overdue && due <= upcomingLimit;
                const highlighted = highlightCommitmentId === c.id;
                return (
                  <tr
                    key={c.id}
                    id={highlighted ? `commitment-${c.id}` : undefined}
                    className={`border-b border-[var(--border)] last:border-0 ${
                      highlighted ? "bg-[var(--navy-soft)]" : ""
                    }`}
                  >
                    <td
                      className={`px-4 py-3 tabular-nums ${
                        overdue
                          ? "font-semibold text-red-700"
                          : dueSoon
                            ? "font-medium text-amber-800"
                            : ""
                      }`}
                    >
                      {formatDate(c.expectedPayAt)}
                      {overdue ? (
                        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide">
                          Atrasado
                        </span>
                      ) : dueSoon ? (
                        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide">
                          Prazo próximo
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/planejamento/${c.planningProjectId}`}
                        className="font-medium text-[var(--navy)] hover:underline"
                      >
                        {c.externalCode}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/planejamento/compromissos/${c.id}`}
                        className="hover:underline"
                      >
                        {c.supplierName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--gray-600)]">
                      {c.rubricLabel}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatCurrency(c.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--gray-500)]">
                      {c.pedidoId ? (
                        <Link
                          href={`/planejamento/${c.planningProjectId}/pedidos/${c.pedidoId}`}
                          className="text-[var(--navy)] hover:underline"
                        >
                          Pedido
                          {c.installmentNumber
                            ? ` · parc. ${c.installmentNumber}`
                            : ""}
                        </Link>
                      ) : (
                        "Reserva"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
