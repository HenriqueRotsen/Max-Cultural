"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { formatCurrency, formatCgccpf, formatDate, normalizeCgccpf } from "@/lib/format";
import { type ActiveRules } from "@/lib/compliance/defaults";
import {
  isExcludedFromBondItem,
  isNearLimit,
  type PersonTypeInput,
} from "@/lib/compliance/rouanet";
import { LimitBadge } from "@/components/ComplianceAlerts";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { FieldLabel } from "@/components/FieldHelp";
import { TablePagination, usePagedSlice } from "@/components/InfiniteScroll";
import { Section } from "@/components/ui";
import { HELP } from "@/lib/help";

function formatPercent(part: number, total: number) {
  if (!total || total <= 0) return "0,00%";
  return `${((part / total) * 100).toFixed(2).replace(".", ",")}%`;
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

/** Partes 2 (Fornecedores) e 3 (Pagamentos) do detalhe do PRONAC. */
export function PronacDetailTables({
  pronac,
  projectTotal,
  accountId,
  accountCgccpf,
  personType,
  bondDocs,
  rules,
  watchedOnly,
  suppliers,
  payments,
  filterSlot,
  firstStep = 2,
}: {
  pronac: string;
  /** Valor captado (base da norma). */
  projectTotal: number;
  accountId?: string;
  accountCgccpf: string | null;
  personType?: PersonTypeInput | null;
  /** CNPJ/CPF com vínculo art. 23 ligado (sem o proponente). */
  bondDocs: string[];
  rules: ActiveRules;
  watchedOnly: boolean;
  suppliers: SupplierRow[];
  payments: PaymentRow[];
  /** Filtro "Todos / Só observados" (form do servidor). */
  filterSlot?: ReactNode;
  firstStep?: number;
}) {
  const [supplierQuery, setSupplierQuery] = useState("");
  const [paymentQuery, setPaymentQuery] = useState("");

  const bondSet = useMemo(() => new Set(bondDocs.map((d) => normalizeCgccpf(d))), [bondDocs]);
  const proponentDoc = accountCgccpf ? normalizeCgccpf(accountCgccpf) : "";

  const filteredSuppliers = useMemo(() => {
    const sorted = [...suppliers].sort((a, b) => b.total - a.total);
    const q = supplierQuery.trim().toLowerCase();
    const qDigits = digitsOnly(supplierQuery);
    if (!q && !qDigits) return sorted;
    return sorted.filter((s) => {
      const doc = digitsOnly(s.cgccpf);
      return (
        s.name.toLowerCase().includes(q) ||
        (qDigits.length > 0 && doc.includes(qDigits))
      );
    });
  }, [suppliers, supplierQuery]);

  const filteredPayments = useMemo(() => {
    const q = paymentQuery.trim().toLowerCase();
    const qDigits = digitsOnly(paymentQuery);
    if (!q && !qDigits) return payments;
    return payments.filter((p) => {
      const hay = [p.supplierName, p.itemName || "", p.documentType || "", p.documentNumber || ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q) || (qDigits.length > 0 && digitsOnly(hay).includes(qDigits));
    });
  }, [payments, paymentQuery]);

  const supplierTotal = filteredSuppliers.reduce((s, row) => s + row.total, 0);
  const paymentTotal = filteredPayments.reduce((s, row) => s + row.amount, 0);
  const overCount = suppliers.filter((s) => {
    const isProponent = !!proponentDoc && normalizeCgccpf(s.cgccpf) === proponentDoc;
    return !isProponent && s.percent > rules.caps.supplierCapPct;
  }).length;

  const suppliersPage = usePagedSlice(filteredSuppliers, 10);
  const paymentsPage = usePagedSlice(filteredPayments);

  return (
    <>
      <Section
        step={firstStep}
        title={watchedOnly ? "Fornecedores observados" : "Fornecedores"}
        help={HELP.limitBadge}
        description={
          <>
            Quem recebeu dinheiro neste PRONAC, do maior valor para o menor. Cada
            fornecedor pode receber até{" "}
            <strong className="font-semibold text-[var(--navy)]">
              {rules.caps.supplierCapPct}% do valor captado
            </strong>
            .{" "}
            {overCount > 0
              ? `${overCount} passou${overCount === 1 ? "" : "ram"} desse limite (em vermelho).`
              : "Em vermelho, quem passou do limite; em amarelo, quem está perto."}
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="field min-w-[16rem] flex-1 md:max-w-sm">
            <FieldLabel htmlFor="filter-suppliers">Buscar fornecedor</FieldLabel>
            <input
              id="filter-suppliers"
              type="search"
              value={supplierQuery}
              placeholder="Nome ou CNPJ/CPF"
              onChange={(e) => setSupplierQuery(e.target.value)}
            />
          </div>
          {filterSlot}
        </div>

        <div className="table-wrap mt-4">
          <table className="data">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Recebeu</th>
                <th>% do captado</th>
                <th>Situação</th>
                <th>Pagamentos</th>
              </tr>
            </thead>
            <tbody>
              {suppliersPage.slice.map((s) => {
                const dig = normalizeCgccpf(s.cgccpf);
                const isProponent = !!proponentDoc && dig === proponentDoc;
                const isBond = bondSet.has(dig);
                const limit = isProponent
                  ? personType === "PF" || personType === "MEI"
                    ? rules.caps.proponentMeiCapPct
                    : rules.caps.proponentCapPct
                  : rules.caps.supplierCapPct;
                const over = s.percent > limit;
                const near = !over && isNearLimit(s.percent, limit, rules);
                return (
                  <tr
                    key={s.supplierId}
                    className={over ? "row-tone-critical" : near ? "row-tone-attention" : undefined}
                  >
                    <td>
                      <Link
                        href={`/panorama/${s.supplierId}?pronac=${pronac}${accountId ? `&accountId=${accountId}` : ""}`}
                        className="font-semibold text-[var(--navy)] underline-offset-2 hover:text-[var(--gold)] hover:underline"
                      >
                        {s.name}
                      </Link>
                      <div className="text-sm text-[var(--gray-500)]">
                        {formatCgccpf(s.cgccpf)}
                        {isProponent ? " · Proponente" : isBond ? " · Com vínculo" : ""}
                      </div>
                    </td>
                    <td className="font-semibold text-[var(--navy)]">{formatCurrency(s.total)}</td>
                    <td>{formatPercent(s.total, projectTotal)}</td>
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
                  <td colSpan={5} className="text-[var(--gray-500)]">
                    {suppliers.length === 0
                      ? watchedOnly
                        ? "Nenhum observado recebeu neste PRONAC."
                        : "Sem pagamentos neste PRONAC."
                      : "Nenhum fornecedor encontrado com essa busca."}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredSuppliers.length > 0 && (
              <tfoot>
                <tr className="table-total-row">
                  <td>Total ({filteredSuppliers.length})</td>
                  <td className="font-semibold text-[var(--navy)]">{formatCurrency(supplierTotal)}</td>
                  <td className="font-semibold text-[var(--navy)]">
                    {formatPercent(supplierTotal, projectTotal)}
                  </td>
                  <td colSpan={2} />
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
      </Section>

      <CollapsibleSection
        step={firstStep + 1}
        title="Pagamentos"
        summary={`${payments.length} pagamento${payments.length === 1 ? "" : "s"}`}
        description="Cada comprovante lançado no SALIC. Abra quando precisar conferir um pagamento específico."
      >
        <div className="field min-w-[16rem] md:max-w-sm">
          <FieldLabel htmlFor="filter-payments">Buscar pagamento</FieldLabel>
          <input
            id="filter-payments"
            type="search"
            value={paymentQuery}
            placeholder="Fornecedor, item ou nº do comprovante"
            onChange={(e) => setPaymentQuery(e.target.value)}
          />
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
                      <div className="text-sm text-[var(--gray-500)]">
                        Não conta para o art. 23
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {p.documentType || "—"}
                    {p.documentNumber ? ` nº ${p.documentNumber}` : ""}
                  </td>
                  <td className="font-semibold text-[var(--navy)]">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-[var(--gray-500)]">
                    {payments.length === 0
                      ? "Sem pagamentos."
                      : "Nenhum pagamento encontrado com essa busca."}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredPayments.length > 0 && (
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={4}>Total ({filteredPayments.length})</td>
                  <td className="font-semibold text-[var(--navy)]">{formatCurrency(paymentTotal)}</td>
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
    </>
  );
}
