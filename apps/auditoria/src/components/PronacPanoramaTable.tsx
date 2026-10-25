"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCurrency, formatCgccpf, normalizeCgccpf } from "@/lib/format";
import { type ActiveRules } from "@/lib/compliance/defaults";
import {
  computeProponentGroupShare,
  isNearLimit,
  nearThresholdForLimit,
  relatedPartyCountsTowardCap,
  type ComplianceTone,
  type PersonTypeInput,
  type RelatedPartyInput,
  worstComplianceTone,
} from "@/lib/compliance/rouanet";
import { LimitBadge } from "@/components/ComplianceAlerts";
import { FieldHelp, ThHelp } from "@/components/FieldHelp";
import { TablePagination, usePagedSlice } from "@/components/InfiniteScroll";
import { HELP } from "@/lib/help";

function formatPercent(part: number, total: number) {
  if (!total || total <= 0) return "0,0000%";
  return `${((part / total) * 100).toFixed(4).replace(".", ",")}%`;
}

function supplierBulletClass(percent: number, limit: number, nearAt: number) {
  if (percent > limit) return "bg-[#d94c4c]";
  if (percent >= nearAt) return "bg-[#e67e22]";
  return "bg-[#16a34a]";
}

function rowToneClass(tone: ComplianceTone) {
  if (tone === "critical") return "row-tone-critical";
  if (tone === "attention") return "row-tone-attention";
  return undefined;
}

function supplierRowToneClass(
  percent: number,
  limit: number,
  nearAt: number,
): string | undefined {
  if (percent > limit) return "row-tone-critical";
  if (percent >= nearAt) return "row-tone-attention";
  return undefined;
}

export type PronacTableRow = {
  projectId: string;
  pronac: string;
  name: string | null;
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
  bySupplier: Array<{
    supplierId: string;
    name: string;
    cgccpf: string;
    total: number;
    count: number;
    percentOfProject: number;
  }>;
  /** Base completa do PRONAC para tom de conformidade art. 23 */
  allBySupplier?: Array<{
    supplierId: string;
    name: string;
    cgccpf: string;
    total: number;
    count: number;
    percentOfProject: number;
  }>;
  /** Totais §1º sem alimentação/refeição */
  bondBySupplier?: Array<{
    supplierId: string;
    name: string;
    cgccpf: string;
    total: number;
    count: number;
    percentOfProject: number;
  }>;
  href: string;
};

function BondSumCell({
  row,
  rules,
}: {
  row: PronacTableRow;
  rules: ActiveRules;
}) {
  const rowRules = row.rules || rules;
  const suppliersForCap = row.bondBySupplier?.length
    ? row.bondBySupplier
    : row.allBySupplier?.length
      ? row.allBySupplier
      : row.bySupplier;
  const group = computeProponentGroupShare({
    projectTotal: row.projectTotal,
    accountCgccpf: row.accountCgccpf,
    personType: row.personType,
    suppliers: suppliersForCap.map((s) => ({
      name: s.name,
      cgccpf: s.cgccpf,
      total: s.total,
    })),
    relatedParties: row.relatedParties,
    rules: rowRules,
  });

  const limitPct =
    row.personType === "PF" || row.personType === "MEI"
      ? rowRules.caps.proponentMeiCapPct
      : rowRules.caps.proponentCapPct;

  if (!group) {
    return <span className="text-[var(--gray-400)]">—</span>;
  }

  const over = group.percent > limitPct;
  const near = isNearLimit(group.percent, limitPct, rowRules);
  const comprovado = row.paidTotal > 0 ? row.paidTotal : row.projectTotal;
  return (
    <span
      className={
        over
          ? "font-semibold text-[#b42318]"
          : near
            ? "font-semibold text-[#c05621]"
            : "font-semibold text-[var(--navy)]"
      }
      title={`art. 23 · captado ${formatPercent(group.amount, row.projectTotal)} · comprovado ${formatPercent(group.amount, comprovado)} · limite ${limitPct}%`}
    >
      {formatPercent(group.amount, row.projectTotal)}
      <span className="ml-1 text-[10px] font-medium text-[var(--gray-500)]">
        ({formatPercent(group.amount, comprovado)} comp.)
      </span>
    </span>
  );
}

export function PronacPanoramaTable({
  rows,
  watchedOnly,
  rules,
}: {
  rows: PronacTableRow[];
  watchedOnly: boolean;
  rules: ActiveRules;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const paging = usePagedSlice(rows);

  function toggle(projectId: string) {
    setExpanded((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  }

  const colSpan = watchedOnly ? 11 : 9;

  return (
    <div>
      <div className="table-wrap table-wrap-lift">
        <table className="data table-expandable">
          <thead>
            <tr>
              <th className="w-10">
                <span className="flex justify-center">
                  <FieldHelp text={HELP.pronacRowLegend} />
                </span>
              </th>
              <th>PRONAC</th>
              <th>Projeto</th>
              <th>Proponente</th>
              <th>IN</th>
              {watchedOnly ? (
                <ThHelp help={HELP.totalObservados}>Total observados</ThHelp>
              ) : (
                <th>Total</th>
              )}
              {watchedOnly && (
                <ThHelp help={HELP.percentCaptado}>% captado</ThHelp>
              )}
              {watchedOnly && (
                <ThHelp help={HELP.percentComprovado}>% comprovado</ThHelp>
              )}
              <ThHelp help={HELP.alerts}>Soma % vínculo art. 23</ThHelp>
              <th>Fornecedores</th>
              <th>Pagamentos</th>
            </tr>
          </thead>
            {paging.slice.map((row) => {
              const open = Boolean(expanded[row.projectId]);
              const rowRules = row.rules || rules;
              const suppliersForAlert = row.allBySupplier?.length
                ? row.allBySupplier
                : row.bySupplier;
              // Cor da linha: fornecedor individual OU soma art. 23.
              const tone = worstComplianceTone(
                suppliersForAlert,
                row.projectTotal,
                row.accountCgccpf,
                {
                  personType: row.personType,
                  relatedParties: row.relatedParties,
                  rules: rowRules,
                  bondSuppliers: row.bondBySupplier || suppliersForAlert,
                },
              );

              const bondSet = new Set(
                (row.relatedParties || [])
                  .filter((p) => relatedPartyCountsTowardCap(p, rowRules))
                  .map((p) => normalizeCgccpf(p.cgccpf)),
              );
              if (row.accountCgccpf) {
                bondSet.add(normalizeCgccpf(row.accountCgccpf));
              }

              // Seta só para fornecedor SEM vínculo perto/acima do teto individual.
              // Soma art. 23 (e vinculados) podem colorir a linha, mas não abrem expansão.
              const alertSuppliers = suppliersForAlert
                .filter((s) => {
                  const dig = normalizeCgccpf(s.cgccpf);
                  if (bondSet.has(dig)) return false;
                  const supplierLimit = rowRules.caps.supplierCapPct;
                  return (
                    s.percentOfProject > supplierLimit ||
                    isNearLimit(s.percentOfProject, supplierLimit, rowRules)
                  );
                })
                .sort((a, b) => b.total - a.total);

              const canExpand = alertSuppliers.length > 0;

              return (
                <tbody
                  key={row.projectId}
                  className={open ? "pronac-expand-card" : undefined}
                >
                  <tr
                    className={`${rowToneClass(tone) || ""} ${open ? "row-expand-parent" : ""} cursor-pointer`.trim()}
                    title="Clique duas vezes para abrir o detalhe do PRONAC"
                    onDoubleClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("a,button")) return;
                      router.push(row.href);
                    }}
                  >
                    <td className="w-10">
                      {canExpand ? (
                        <button
                          type="button"
                          onClick={() => toggle(row.projectId)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--navy)] transition hover:bg-white/70"
                          aria-expanded={open}
                          aria-label={
                            open ? "Recolher fornecedores" : "Expandir avisos"
                          }
                          title={open ? "Recolher" : "Ver fornecedores do aviso"}
                        >
                          <Chevron open={open} />
                        </button>
                      ) : (
                        <span className="inline-block w-8" />
                      )}
                    </td>
                    <td>
                      <Link
                        href={row.href}
                        className="font-semibold text-[var(--navy)] underline-offset-2 hover:text-[var(--gold)] hover:underline"
                      >
                        {row.pronac}
                      </Link>
                    </td>
                    <td>{row.name || "—"}</td>
                    <td>{row.accountName}</td>
                    <td className="text-xs">
                      {row.rulesetSourceUrl || rowRules.sourceUrl ? (
                        <a
                          href={row.rulesetSourceUrl || rowRules.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[var(--navy)] underline-offset-2 hover:text-[var(--gold)] hover:underline"
                          title="Abrir texto da instrução normativa"
                        >
                          {row.rulesetSourceCode || rowRules.sourceCode}
                        </a>
                      ) : (
                        <span className="text-[var(--gray-600)]">
                          {row.rulesetSourceCode || rowRules.sourceCode}
                        </span>
                      )}
                    </td>
                    <td className="font-semibold text-[var(--navy)]">
                      {formatCurrency(row.total)}
                    </td>
                    {watchedOnly && (
                      <td title={`Captado: ${formatCurrency(row.projectTotal)}`}>
                        {formatPercent(row.total, row.projectTotal)}
                      </td>
                    )}
                    {watchedOnly && (
                      <td
                        title={`Comprovado: ${formatCurrency(row.paidTotal > 0 ? row.paidTotal : row.projectTotal)}`}
                      >
                        {formatPercent(
                          row.total,
                          row.paidTotal > 0 ? row.paidTotal : row.projectTotal,
                        )}
                      </td>
                    )}
                    <td>
                      <BondSumCell row={row} rules={rules} />
                    </td>
                    <td>{row.supplierCount}</td>
                    <td>{row.paymentCount}</td>
                  </tr>

                  {canExpand &&
                    open &&
                    alertSuppliers.map((s, idx) => {
                      const supplierLimit = rowRules.caps.supplierCapPct;
                      const displayTotal = s.total;
                      const displayPct = s.percentOfProject;
                      const isLast = idx === alertSuppliers.length - 1;
                      const nearAt = nearThresholdForLimit(
                        supplierLimit,
                        rowRules,
                      );
                      const toneClass =
                        supplierRowToneClass(
                          displayPct,
                          supplierLimit,
                          nearAt,
                        ) || "";
                      return (
                        <tr
                          key={`${row.projectId}-${s.supplierId}`}
                          className={`row-expand-child ${isLast ? "row-expand-child-last" : ""} ${toneClass}`.trim()}
                        >
                          <td className="row-expand-gutter" aria-hidden />
                          <td colSpan={3} className="text-[var(--gray-600)]">
                            <span
                              className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${supplierBulletClass(displayPct, supplierLimit, nearAt)}`}
                            />
                            <span className="font-medium text-[var(--navy)]">{s.name}</span>
                            <span className="ml-2 text-[var(--gray-400)]">
                              {formatCgccpf(s.cgccpf)}
                            </span>
                          </td>
                          <td className="text-xs text-[var(--gray-500)]">
                            <LimitBadge
                              percent={displayPct}
                              isProponent={false}
                              personType={row.personType}
                              rules={rowRules}
                            />
                          </td>
                          <td className="font-medium text-[var(--navy)]">
                            {formatCurrency(displayTotal)}
                          </td>
                          {watchedOnly ? (
                            <>
                              <td>{formatPercent(displayTotal, row.projectTotal)}</td>
                              <td>
                                {formatPercent(
                                  displayTotal,
                                  row.paidTotal > 0 ? row.paidTotal : row.projectTotal,
                                )}
                              </td>
                            </>
                          ) : null}
                          <td />
                          <td>{s.count}</td>
                          <td />
                        </tr>
                      );
                    })}
                </tbody>
              );
            })}

            {rows.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={colSpan} className="text-[var(--gray-500)]">
                    {watchedOnly
                      ? "Nenhum PRONAC com pagamento aos fornecedores observados."
                      : "Sem dados por PRONAC. Atualize os dados primeiro."}
                  </td>
                </tr>
              </tbody>
            )}
        </table>
      </div>
      <PronacToneLegend />
      <TablePagination
        page={paging.page}
        pageCount={paging.pageCount}
        total={paging.total}
        from={paging.from}
        to={paging.to}
        onPageChange={paging.setPage}
      />
    </div>
  );
}

function PronacToneLegend() {
  return (
    <p className="pronac-tone-legend">
      <span>
        <i className="pronac-tone-swatch pronac-tone-swatch-critical" aria-hidden />
        Acima do limite
      </span>
      <span>
        <i className="pronac-tone-swatch pronac-tone-swatch-attention" aria-hidden />
        Perto do limite
      </span>
      <span>
        <Chevron open={false} />
        Sem vínculo, perto ou acima do teto
      </span>
    </p>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
