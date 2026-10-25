"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCurrency, formatCgccpf, formatDate, normalizeCgccpf } from "@/lib/format";
import { type ActiveRules } from "@/lib/compliance/defaults";
import {
  computeProponentGroupShare,
  isExcludedFromBondItem,
  isNearLimit,
  relatedPartyCountsTowardCap,
  type PersonTypeInput,
  type RelatedPartyInput,
} from "@/lib/compliance/rouanet";
import { LimitBadge } from "@/components/ComplianceAlerts";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { FieldLabel, ThHelp } from "@/components/FieldHelp";
import { TablePagination, usePagedSlice } from "@/components/InfiniteScroll";
import { HELP } from "@/lib/help";

function formatPercent(part: number, total: number) {
  if (!total || total <= 0) return "0,0000%";
  return `${((part / total) * 100).toFixed(4).replace(".", ",")}%`;
}

function formatPercentValue(value: number) {
  return `${value.toFixed(4).replace(".", ",")}%`;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

type SupplierRow = {
  supplierId: string;
  name: string;
  cgccpf: string;
  total: number;
  percent: number;
  count: number;
};

type PaymentRow = {
  id: string;
  paymentDate: string | null;
  supplierName: string;
  itemName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  amount: number;
  source: string;
};

type WatchedRow = {
  name: string;
  cgccpf: string | null;
  label: string | null;
};

export function PronacDetailTables({
  pronac,
  projectTotal,
  paidTotal,
  accountId,
  accountCgccpf,
  personType,
  relatedParties,
  rules,
  watchedOnly,
  suppliers,
  allSuppliers,
  bondSuppliers,
  watchedSuppliers,
  payments,
}: {
  pronac: string;
  /** Valor captado (base da norma). */
  projectTotal: number;
  /** Soma dos comprovados/pagamentos. */
  paidTotal: number;
  accountId?: string;
  accountCgccpf: string | null;
  personType?: PersonTypeInput | null;
  relatedParties?: RelatedPartyInput[];
  rules: ActiveRules;
  watchedOnly: boolean;
  suppliers: SupplierRow[];
  allSuppliers?: SupplierRow[];
  /** Totais §1º sem alimentação/refeição. */
  bondSuppliers?: SupplierRow[];
  watchedSuppliers?: WatchedRow[];
  payments: PaymentRow[];
}) {
  const [supplierQuery, setSupplierQuery] = useState("");
  const [paymentQuery, setPaymentQuery] = useState("");

  const comprovadoTotal = paidTotal > 0 ? paidTotal : projectTotal;
  const suppliersForBond = bondSuppliers?.length
    ? bondSuppliers
    : allSuppliers?.length
      ? allSuppliers
      : suppliers;
  const suppliersForPaidDisplay = allSuppliers?.length ? allSuppliers : suppliers;

  const bondSet = useMemo(() => {
    const set = new Set(
      (relatedParties || [])
        .filter((r) => relatedPartyCountsTowardCap(r, rules))
        .map((r) => normalizeCgccpf(r.cgccpf)),
    );
    if (accountCgccpf) set.add(normalizeCgccpf(accountCgccpf));
    return set;
  }, [relatedParties, rules, accountCgccpf]);

  const group = useMemo(
    () =>
      computeProponentGroupShare({
        projectTotal,
        accountCgccpf,
        personType,
        suppliers: suppliersForBond.map((s) => ({
          name: s.name,
          cgccpf: s.cgccpf,
          total: s.total,
        })),
        relatedParties,
        rules,
      }),
    [projectTotal, accountCgccpf, personType, suppliersForBond, relatedParties, rules],
  );

  const limitPct =
    personType === "PF" || personType === "MEI"
      ? rules.caps.proponentMeiCapPct
      : rules.caps.proponentCapPct;

  const sortedSuppliers = useMemo(() => {
    return [...suppliers].sort((a, b) => {
      const aBond = bondSet.has(normalizeCgccpf(a.cgccpf)) ? 1 : 0;
      const bBond = bondSet.has(normalizeCgccpf(b.cgccpf)) ? 1 : 0;
      if (aBond !== bBond) return bBond - aBond;
      return b.total - a.total;
    });
  }, [suppliers, bondSet]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    const qDigits = digitsOnly(supplierQuery);
    if (!q && !qDigits) return sortedSuppliers;
    return sortedSuppliers.filter((s) => {
      const name = s.name.toLowerCase();
      const doc = digitsOnly(s.cgccpf);
      return (
        name.includes(q) ||
        formatCgccpf(s.cgccpf).toLowerCase().includes(q) ||
        (qDigits.length > 0 && doc.includes(qDigits))
      );
    });
  }, [sortedSuppliers, supplierQuery]);

  const filteredPayments = useMemo(() => {
    const q = paymentQuery.trim().toLowerCase();
    const qDigits = digitsOnly(paymentQuery);
    if (!q && !qDigits) return payments;
    return payments.filter((p) => {
      const hay = [
        p.supplierName,
        p.itemName || "",
        p.documentType || "",
        p.documentNumber || "",
        p.source,
      ]
        .join(" ")
        .toLowerCase();
      return (
        hay.includes(q) ||
        (qDigits.length > 0 && digitsOnly(hay).includes(qDigits))
      );
    });
  }, [payments, paymentQuery]);

  const paymentTotals = useMemo(() => {
    const amount = filteredPayments.reduce((s, row) => s + row.amount, 0);
    const percentCaptado =
      projectTotal > 0 ? (amount / projectTotal) * 100 : 0;
    const percentComprovado =
      comprovadoTotal > 0 ? (amount / comprovadoTotal) * 100 : 0;
    return { amount, percentCaptado, percentComprovado, count: filteredPayments.length };
  }, [filteredPayments, projectTotal, comprovadoTotal]);

  const supplierTotals = useMemo(() => {
    const amount = filteredSuppliers.reduce((s, row) => s + row.total, 0);
    const percentCaptado = filteredSuppliers.reduce(
      (s, row) => s + (projectTotal > 0 ? (row.total / projectTotal) * 100 : 0),
      0,
    );
    const percentComprovado = filteredSuppliers.reduce(
      (s, row) =>
        s + (comprovadoTotal > 0 ? (row.total / comprovadoTotal) * 100 : 0),
      0,
    );
    const paymentsCount = filteredSuppliers.reduce((s, row) => s + row.count, 0);
    return {
      amount,
      percentCaptado,
      percentComprovado,
      paymentsCount,
      count: filteredSuppliers.length,
    };
  }, [filteredSuppliers, projectTotal, comprovadoTotal]);

  const paidByCgccpf = useMemo(
    () => new Map(suppliersForPaidDisplay.map((s) => [normalizeCgccpf(s.cgccpf), s])),
    [suppliersForPaidDisplay],
  );

  const watched = watchedSuppliers || [];
  const bondCount = watched.filter((w) => {
    const dig = normalizeCgccpf(w.cgccpf || "");
    return dig ? bondSet.has(dig) : false;
  }).length;

  const suppliersPage = usePagedSlice(filteredSuppliers);
  const paymentsPage = usePagedSlice(filteredPayments);

  const groupOver = group ? group.percent > limitPct : false;

  return (
    <div className="space-y-6">
      <section className="card border-[var(--gold)]/40 bg-[var(--gold-soft)]/40 p-5">
        <h2 className="text-base font-semibold text-[var(--navy)]">
          Vínculos art. 23
        </h2>
        <p className="mt-1 text-sm text-[var(--gray-600)]">
          Proponente + observados com vínculo · limite {limitPct}% do captado ({rules.sourceCode}).
          Alimentação/refeição não entram nesta soma.
        </p>

        {group ? (
          <div className="table-wrap mt-4">
            <table className="data">
              <thead>
                <tr>
                  <th>Parte</th>
                  <th>Vínculo</th>
                  <th>Total</th>
                  <ThHelp help={HELP.percentCaptado}>% captado</ThHelp>
                  <ThHelp help={HELP.percentComprovado}>% comprovado</ThHelp>
                </tr>
              </thead>
              <tbody>
                {group.members.map((m) => {
                  const rel =
                    m.role === "proponent" ? "Proponente" : "Com vínculo";
                  return (
                    <tr key={`${m.cgccpf}-${m.role}`}>
                      <td>
                        <span className="font-semibold text-[var(--navy)]">{m.name}</span>
                        <div className="text-xs text-[var(--gray-400)]">
                          {formatCgccpf(m.cgccpf)}
                        </div>
                      </td>
                      <td>{rel}</td>
                      <td className="font-semibold text-[var(--navy)]">
                        {formatCurrency(m.amount)}
                      </td>
                      <td className="font-semibold">
                        {formatPercent(m.amount, projectTotal)}
                      </td>
                      <td>{formatPercent(m.amount, comprovadoTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={2}>Soma art. 23</td>
                  <td className="font-semibold text-[var(--navy)]">
                    {formatCurrency(group.amount)}
                  </td>
                  <td
                    className={`font-semibold ${groupOver ? "text-[#b42318]" : "text-[var(--navy)]"}`}
                  >
                    {formatPercent(group.amount, projectTotal)}
                    <span className="ml-1 text-xs font-medium text-[var(--gray-500)]">
                      / {limitPct}%
                    </span>
                  </td>
                  <td className="font-semibold">
                    {formatPercent(group.amount, comprovadoTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--gray-600)]">
            Sem pagamentos a observados com vínculo ligado neste PRONAC.
          </p>
        )}
      </section>

      <CollapsibleSection
        title="Observados neste PRONAC"
        summary={
          watched.length === 0
            ? "Nenhum com pagamento neste projeto"
            : `${watched.length} com pagamento${
                bondCount > 0 ? ` · ${bondCount} com vínculo` : ""
              }`
        }
        expandLabel="Expandir lista"
        collapseLabel="Recolher lista"
        defaultOpen={false}
      >
        {watched.length === 0 ? (
          <p className="text-sm text-[var(--navy)]">
            Só aparecem aqui observados que receberam neste PRONAC.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Observado</th>
                  <th>CNPJ/CPF</th>
                  <th>Vínculo art. 23</th>
                  <th>Pago neste PRONAC</th>
                  <ThHelp help={HELP.percentCaptado}>% captado</ThHelp>
                  <ThHelp help={HELP.percentComprovado}>% comprovado</ThHelp>
                </tr>
              </thead>
              <tbody>
                {watched.map((w, i) => {
                  const dig = normalizeCgccpf(w.cgccpf || "");
                  const isBond = dig ? bondSet.has(dig) : false;
                  const paid = dig ? paidByCgccpf.get(dig) : undefined;
                  return (
                    <tr key={`${w.cgccpf || w.name}-${i}`}>
                      <td>{i + 1}</td>
                      <td>
                        <span className="font-semibold text-[var(--navy)]">{w.name}</span>
                        {w.label && w.label !== w.name ? (
                          <div className="text-xs text-[var(--gray-400)]">{w.label}</div>
                        ) : null}
                      </td>
                      <td>{formatCgccpf(w.cgccpf)}</td>
                      <td>
                        {isBond ? (
                          <span className="text-xs font-medium text-[var(--navy)]">
                            Sim
                          </span>
                        ) : (
                          <span className="text-[var(--gray-400)]">Não</span>
                        )}
                      </td>
                      <td>
                        {paid ? (
                          <span className="font-semibold text-[var(--navy)]">
                            {formatCurrency(paid.total)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{paid ? formatPercent(paid.total, projectTotal) : "—"}</td>
                      <td>{paid ? formatPercent(paid.total, comprovadoTotal) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--navy)]">
              {watchedOnly ? "Fornecedores observados" : "Fornecedores"}
            </h2>
            <p className="mt-1 text-sm text-[var(--gray-500)]">
              {filteredSuppliers.length} na lista · art. 23 primeiro
            </p>
            <p className="pronac-tone-legend mt-2">
              <span>
                <i className="pronac-tone-swatch pronac-tone-swatch-critical" aria-hidden />
                Acima do limite
              </span>
              <span>
                <i className="pronac-tone-swatch pronac-tone-swatch-attention" aria-hidden />
                Perto do limite
              </span>
            </p>
          </div>
          <div className="field min-w-[16rem] flex-1 md:max-w-sm">
            <FieldLabel htmlFor="filter-suppliers">Filtrar</FieldLabel>
            <input
              id="filter-suppliers"
              value={supplierQuery}
              placeholder="Nome ou CNPJ/CPF"
              onChange={(e) => setSupplierQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap mt-4">
          <table className="data">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>CNPJ/CPF</th>
                <th>Vínculo art. 23</th>
                <th>Total</th>
                <ThHelp help={HELP.percentCaptado}>% captado</ThHelp>
                <ThHelp help={HELP.percentComprovado}>% comprovado</ThHelp>
                <ThHelp help={HELP.limitBadge}>Limite</ThHelp>
                <th>Pag.</th>
              </tr>
            </thead>
            <tbody>
              {suppliersPage.slice.map((s) => {
                const dig = normalizeCgccpf(s.cgccpf);
                const isBond = bondSet.has(dig);
                const isProponent =
                  !!accountCgccpf && dig === normalizeCgccpf(accountCgccpf);
                const supplierLimit = isProponent
                  ? limitPct
                  : rules.caps.supplierCapPct;
                const over = s.percent > supplierLimit;
                const near = !over && isNearLimit(s.percent, supplierLimit, rules);
                const toneClass = over
                  ? "row-tone-critical"
                  : near
                    ? "row-tone-attention"
                    : undefined;
                return (
                  <tr key={s.supplierId} className={toneClass}>
                    <td>
                      <Link
                        href={`/panorama/${s.supplierId}?pronac=${pronac}${accountId ? `&accountId=${accountId}` : ""}`}
                        className="font-semibold text-[var(--navy)] underline-offset-2 hover:text-[var(--gold)] hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td>{formatCgccpf(s.cgccpf)}</td>
                    <td>
                      {isBond ? (
                        <span className="text-xs font-medium text-[var(--navy)]">
                          {isProponent ? "Proponente" : "Sim"}
                        </span>
                      ) : (
                        <span className="text-[var(--gray-400)]">Não</span>
                      )}
                    </td>
                    <td className="font-semibold text-[var(--navy)]">
                      {formatCurrency(s.total)}
                    </td>
                    <td className="font-semibold">{formatPercent(s.total, projectTotal)}</td>
                    <td>{formatPercent(s.total, comprovadoTotal)}</td>
                    <td>
                      <LimitBadge
                        percent={s.percent}
                        isProponent={isProponent}
                        personType={personType}
                        rules={rules}
                      />
                    </td>
                    <td>{s.count}</td>
                  </tr>
                );
              })}
              {filteredSuppliers.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-[var(--gray-500)]">
                    {suppliers.length === 0
                      ? watchedOnly
                        ? "Nenhum observado com pagamento neste PRONAC."
                        : "Sem pagamentos neste PRONAC."
                      : "Nenhum fornecedor corresponde ao filtro."}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredSuppliers.length > 0 && (
              <tfoot>
                {group ? (
                  <tr className="table-total-row">
                    <td colSpan={3}>Soma art. 23</td>
                    <td className="font-semibold text-[var(--navy)]">
                      {formatCurrency(group.amount)}
                    </td>
                    <td
                      className={`font-semibold ${groupOver ? "text-[#b42318]" : "text-[var(--navy)]"}`}
                    >
                      {formatPercent(group.amount, projectTotal)}
                      <span className="ml-1 text-xs font-medium text-[var(--gray-500)]">
                        / {limitPct}%
                      </span>
                    </td>
                    <td className="font-semibold">
                      {formatPercent(group.amount, comprovadoTotal)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                ) : null}
                <tr className="table-total-row">
                  <td colSpan={3}>
                    Total ({supplierTotals.count})
                  </td>
                  <td className="font-semibold text-[var(--navy)]">
                    {formatCurrency(supplierTotals.amount)}
                  </td>
                  <td className="font-semibold text-[var(--navy)]">
                    {formatPercentValue(supplierTotals.percentCaptado)}
                  </td>
                  <td className="font-semibold text-[var(--navy)]">
                    {formatPercentValue(supplierTotals.percentComprovado)}
                  </td>
                  <td />
                  <td className="font-semibold">{supplierTotals.paymentsCount}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <TablePagination
          page={suppliersPage.page}
          pageCount={suppliersPage.pageCount}
          total={suppliersPage.total}
          from={suppliersPage.from}
          to={suppliersPage.to}
          onPageChange={suppliersPage.setPage}
        />
      </section>

      <CollapsibleSection
        title="Linhas de pagamento"
        summary={`${payments.length} comprovante${payments.length === 1 ? "" : "s"}`}
        expandLabel="Expandir pagamentos"
        collapseLabel="Recolher pagamentos"
        defaultOpen={false}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="field min-w-[16rem] flex-1 md:max-w-sm">
            <FieldLabel htmlFor="filter-payments">Filtrar</FieldLabel>
            <input
              id="filter-payments"
              value={paymentQuery}
              placeholder="Fornecedor, item ou comprovante"
              onChange={(e) => setPaymentQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap mt-4">
          <table className="data">
            <thead>
              <tr>
                <th>Data</th>
                <th>Fornecedor</th>
                <th>Item</th>
                <th>Comprovante</th>
                <th>Valor</th>
                <th>% captado</th>
                <th>% comprovado</th>
              </tr>
            </thead>
            <tbody>
              {paymentsPage.slice.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.paymentDate)}</td>
                  <td>{p.supplierName}</td>
                  <td>
                    <span>{p.itemName || "—"}</span>
                    {isExcludedFromBondItem(p.itemName) ? (
                      <span
                        className="badge badge-muted ml-2"
                        title="Alimentação/refeição não entra na soma do vínculo art. 23"
                      >
                        Não entrou no cálculo do vínculo
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {p.documentType || "—"}
                    {p.documentNumber ? ` nº ${p.documentNumber}` : ""}
                  </td>
                  <td className="font-semibold text-[var(--navy)]">
                    {formatCurrency(p.amount)}
                  </td>
                  <td>{formatPercent(p.amount, projectTotal)}</td>
                  <td>{formatPercent(p.amount, comprovadoTotal)}</td>
                </tr>
              ))}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-[var(--gray-500)]">
                    {payments.length === 0
                      ? "Sem linhas de pagamento."
                      : "Nenhum pagamento corresponde ao filtro."}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredPayments.length > 0 && (
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={4}>Total ({paymentTotals.count})</td>
                  <td className="font-semibold text-[var(--navy)]">
                    {formatCurrency(paymentTotals.amount)}
                  </td>
                  <td className="font-semibold text-[var(--navy)]">
                    {formatPercentValue(paymentTotals.percentCaptado)}
                  </td>
                  <td className="font-semibold text-[var(--navy)]">
                    {formatPercentValue(paymentTotals.percentComprovado)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <TablePagination
          page={paymentsPage.page}
          pageCount={paymentsPage.pageCount}
          total={paymentsPage.total}
          from={paymentsPage.from}
          to={paymentsPage.to}
          onPageChange={paymentsPage.setPage}
        />
      </CollapsibleSection>
    </div>
  );
}
