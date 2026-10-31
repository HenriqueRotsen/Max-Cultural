"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import { type ActiveRules } from "@/lib/compliance/defaults";
import {
  computeProponentGroupShare,
  proponentLimitPct,
  type ComplianceTone,
  type PersonTypeInput,
  type RelatedPartyInput,
  worstComplianceTone,
} from "@/lib/compliance/rouanet";
import { FieldLabel } from "@/components/FieldHelp";
import { TablePagination, usePagedSlice } from "@/components/InfiniteScroll";
import { HELP } from "@/lib/help";
import { SITUACAO_BADGE, situacaoLabel } from "@/lib/salic/situacao-label";

/** Minúsculas e sem acento, para a busca casar "praca" com "Praça". */
function norm(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function pctLabel(value: number) {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

type SupplierAgg = {
  supplierId: string;
  name: string;
  cgccpf: string;
  total: number;
  count: number;
  percentOfProject: number;
};

export type PronacTableRow = {
  projectId: string;
  pronac: string;
  name: string | null;
  /** Situação do dia no SALIC (sync diário). */
  situacao?: string | null;
  accountName: string;
  accountCgccpf: string;
  personType?: PersonTypeInput;
  relatedParties?: RelatedPartyInput[];
  rules?: ActiveRules;
  rulesetSourceCode?: string | null;
  rulesetSourceUrl?: string | null;
  projectTotal: number;
  /** Soma dos comprovados (pagamentos) do PRONAC. */
  paidTotal: number;
  total: number;
  paymentCount: number;
  supplierCount: number;
  bySupplier: SupplierAgg[];
  /** Base completa do PRONAC para tom de conformidade art. 23 */
  allBySupplier?: SupplierAgg[];
  /** Totais §1º sem alimentação/refeição */
  bondBySupplier?: SupplierAgg[];
  href: string;
};

type StatusFilter = "todos" | "critical" | "attention" | "ok";

const TONE_RANK: Record<ComplianceTone, number> = { critical: 0, attention: 1, ok: 2 };

const STATUS_LABEL: Record<ComplianceTone, string> = {
  critical: "Acima do limite",
  attention: "Perto do limite",
  ok: "Dentro do limite",
};

const STATUS_BADGE: Record<ComplianceTone, string> = {
  critical: "badge-danger",
  attention: "badge-attention",
  ok: "badge-success",
};

/**
 * Lista "Por PRONAC": busca e situação filtram na hora; proponente, período e
 * "só observados" mudam a URL (dados vêm do servidor). A linha inteira abre o detalhe.
 */
export function PronacPanoramaTable({
  rows,
  watchedOnly,
  watchedCount,
  rules,
  accounts,
  accountId,
  from,
  to,
}: {
  rows: PronacTableRow[];
  watchedOnly: boolean;
  watchedCount: number;
  rules: ActiveRules;
  accounts: Array<{ id: string; name: string }>;
  accountId?: string;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todos");

  function setParam(updates: Record<string, string | null>) {
    const qs = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) qs.set(k, v);
      else qs.delete(k);
    }
    startTransition(() => router.push(`${pathname}?${qs.toString()}`));
  }

  const enriched = useMemo(
    () =>
      rows.map((row) => {
        const rowRules = row.rules || rules;
        const all = row.allBySupplier?.length ? row.allBySupplier : row.bySupplier;
        const bond = row.bondBySupplier?.length ? row.bondBySupplier : all;
        const tone = worstComplianceTone(all, row.projectTotal, row.accountCgccpf, {
          personType: row.personType,
          relatedParties: row.relatedParties,
          rules: rowRules,
          bondSuppliers: bond,
        });
        const group = computeProponentGroupShare({
          projectTotal: row.projectTotal,
          accountCgccpf: row.accountCgccpf,
          personType: row.personType,
          suppliers: bond,
          relatedParties: row.relatedParties,
          rules: rowRules,
        });
        return {
          row,
          tone,
          groupPct: group?.percent ?? 0,
          limitPct: proponentLimitPct(rowRules, row.personType),
          noLimits: Boolean(rowRules.caps.noPercentLimits),
          salic: situacaoLabel(row.situacao),
          hay: norm(
            `${row.pronac} ${row.name || ""} ${row.accountName} ${situacaoLabel(row.situacao)?.label || ""} ${row.situacao || ""}`,
          ),
        };
      }),
    [rows, rules],
  );

  const counts = useMemo(() => {
    const c = { critical: 0, attention: 0, ok: 0 };
    for (const e of enriched) c[e.tone] += 1;
    return c;
  }, [enriched]);

  const visible = useMemo(() => {
    const terms = norm(query).split(/\s+/).filter(Boolean);
    return enriched
      .filter((e) => status === "todos" || e.tone === status)
      .filter((e) => terms.every((t) => e.hay.includes(t)))
      .sort(
        (a, b) =>
          TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.row.pronac.localeCompare(b.row.pronac),
      );
  }, [enriched, query, status]);

  const paging = usePagedSlice(visible);
  const hasServerFilters = Boolean(accountId || from || to || watchedOnly);

  const chips: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "todos", label: "Todos", count: enriched.length },
    { key: "critical", label: "Acima do limite", count: counts.critical },
    { key: "attention", label: "Perto do limite", count: counts.attention },
    { key: "ok", label: "Dentro do limite", count: counts.ok },
  ];

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="field">
            <FieldLabel htmlFor="pronac-search">Buscar projeto</FieldLabel>
            <input
              id="pronac-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="PRONAC, projeto, proponente ou situação"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <FieldLabel htmlFor="accountId" help={HELP.filterProponente}>
              Proponente
            </FieldLabel>
            <select
              id="accountId"
              value={accountId || ""}
              onChange={(e) => setParam({ accountId: e.target.value || null })}
            >
              <option value="">Todos os proponentes</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[0.85rem] font-semibold text-[var(--gray-500)]">Limites</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por limites">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setStatus(c.key)}
                aria-pressed={status === c.key}
                className={`filter-chip filter-chip-${c.key}${status === c.key ? " is-active" : ""}`}
              >
                {c.label}
                <span className="filter-chip-count">{c.count}</span>
              </button>
            ))}
          </div>
        </div>

        <details className="more-filters" open={Boolean(from || to || watchedOnly) || undefined}>
          <summary>Mais filtros (período e observados)</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div className="field">
              <FieldLabel htmlFor="from" help={HELP.filterFrom}>
                Pagamentos a partir de
              </FieldLabel>
              <input
                id="from"
                type="date"
                defaultValue={from || ""}
                onChange={(e) => setParam({ from: e.target.value || null })}
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="to" help={HELP.filterTo}>
                Pagamentos até
              </FieldLabel>
              <input
                id="to"
                type="date"
                defaultValue={to || ""}
                onChange={(e) => setParam({ to: e.target.value || null })}
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="watchedOnly" help={HELP.watchedOnly}>
                Valores de
              </FieldLabel>
              <select
                id="watchedOnly"
                value={watchedOnly ? "1" : "0"}
                onChange={(e) => setParam({ watchedOnly: e.target.value === "1" ? "1" : null })}
              >
                <option value="0">Todos os fornecedores</option>
                <option value="1" disabled={watchedCount === 0}>
                  Só observados{watchedCount > 0 ? ` (${watchedCount})` : " (nenhum cadastrado)"}
                </option>
              </select>
            </div>
          </div>
        </details>

        {hasServerFilters || query || status !== "todos" ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3 text-[0.95rem]">
            <span className="text-[var(--gray-600)]" aria-live="polite">
              Mostrando <strong className="text-[var(--navy)]">{visible.length}</strong> de{" "}
              {enriched.length} PRONACs
              {watchedOnly ? " · valores só dos observados" : ""}
            </span>
            <button
              type="button"
              className="font-semibold text-[var(--gold-ink)] underline-offset-2 hover:underline"
              onClick={() => {
                setQuery("");
                setStatus("todos");
                if (hasServerFilters) startTransition(() => router.push(pathname));
              }}
            >
              Limpar filtros
            </button>
          </div>
        ) : null}
      </div>

      <div className={`card overflow-hidden ${loading ? "opacity-60" : ""}`}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Limites</th>
                <th>Projeto</th>
                <th>No SALIC</th>
                <th>Proponente</th>
                <th>{watchedOnly ? "Pago a observados" : "Já pago"}</th>
                <th>Soma do art. 23</th>
                <th className="w-10" aria-label="Abrir" />
              </tr>
            </thead>
            <tbody>
              {paging.slice.map(({ row, tone, groupPct, limitPct, noLimits, salic }) => (
                <tr
                  key={row.projectId}
                  className={`row-link ${tone === "critical" ? "row-tone-critical" : tone === "attention" ? "row-tone-attention" : ""}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button")) return;
                    router.push(row.href);
                  }}
                >
                  <td>
                    <span className={`badge ${STATUS_BADGE[tone]}`}>{STATUS_LABEL[tone]}</span>
                  </td>
                  <td>
                    <Link
                      href={row.href}
                      className="font-semibold text-[var(--navy)] underline-offset-2 hover:underline"
                    >
                      {row.pronac}
                    </Link>
                    <div className="text-sm text-[var(--gray-600)]">{row.name || "Sem nome"}</div>
                  </td>
                  <td>
                    {salic ? (
                      <span
                        className={`badge ${SITUACAO_BADGE[salic.tone]}`}
                        title={`${salic.code ? `${salic.code} · ` : ""}${salic.detail}`}
                      >
                        {salic.label}
                      </span>
                    ) : (
                      <span className="text-[var(--gray-400)]">—</span>
                    )}
                  </td>
                  <td className="text-[var(--gray-600)]">{row.accountName}</td>
                  <td>
                    <span className="font-semibold text-[var(--navy)]">
                      {formatCurrency(row.total)}
                    </span>
                    <div className="text-sm text-[var(--gray-500)]">
                      {row.paymentCount} pagamento{row.paymentCount === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td>
                    <span
                      className={
                        groupPct > limitPct
                          ? "font-semibold text-[#b42318]"
                          : "font-semibold text-[var(--navy)]"
                      }
                    >
                      {pctLabel(groupPct)}
                    </span>
                    <span className="text-sm text-[var(--gray-500)]">
                      {noLimits ? " · IN sem limite" : ` de ${limitPct}%`}
                    </span>
                  </td>
                  <td className="text-right text-[var(--gray-400)]" aria-hidden>
                    ›
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-[var(--gray-500)]">
                    {rows.length === 0
                      ? watchedOnly
                        ? "Nenhum PRONAC com pagamento aos observados."
                        : "Nenhum PRONAC ainda. Atualize os dados do SALIC primeiro."
                      : "Nenhum PRONAC encontrado com esses filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 pb-4">
          <TablePagination
            page={paging.page}
            pageCount={paging.pageCount}
            total={paging.total}
            from={paging.from}
            to={paging.to}
            onPageChange={paging.setPage}
          />
        </div>
      </div>
    </div>
  );
}
