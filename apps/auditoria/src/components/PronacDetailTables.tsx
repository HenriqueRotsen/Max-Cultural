"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { setPaymentCountsForBond } from "@/lib/actions";
import { actionErrorMessage } from "@/lib/action-errors";
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
import { Section, Switch } from "@/components/ui";
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
  /** Conta para o vínculo com o proponente (marcação manual ou automática). */
  countsForBond: boolean;
  /** Marcado à mão (senão segue a regra: alimentação/refeição não contam). */
  bondMarkedByHand: boolean;
};

/** Partes 2 (Fornecedores) e 3 (Pagamentos) do detalhe do PRONAC. */
export function PronacDetailTables({
  pronac,
  projectId,
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
  projectId: string | null;
  /** Valor captado (base da norma). */
  projectTotal: number;
  accountId?: string;
  accountCgccpf: string | null;
  personType?: PersonTypeInput | null;
  /** CNPJ/CPF com vínculo com o proponente ligado neste PRONAC. */
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
  const router = useRouter();
  const [savingPayment, setSavingPayment] = useState<string | null>(null);
  const [bondError, setBondError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleCounts(p: PaymentRow, next: boolean) {
    if (!projectId) return;
    setBondError(null);
    setSavingPayment(p.id);
    // Voltar ao que a regra automática diria = tirar a marcação manual.
    const auto = !isExcludedFromBondItem(p.itemName);
    const countsForBond = next === auto ? null : next;
    startTransition(async () => {
      try {
        const result = await setPaymentCountsForBond({
          projectId,
          changes: [{ paymentId: p.id, countsForBond }],
        });
        if (!result.ok) setBondError(result.error);
        else router.refresh();
      } catch (err) {
        setBondError(actionErrorMessage(err, "Não foi possível salvar."));
      } finally {
        setSavingPayment(null);
      }
    });
  }

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
    return !rules.caps.noPercentLimits && !isProponent && s.percent > rules.caps.supplierCapPct;
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
          rules.caps.noPercentLimits ? (
            <>
              Quem recebeu dinheiro neste PRONAC, do maior valor para o menor. A{" "}
              {rules.sourceCode} não define limite por fornecedor.
            </>
          ) : (
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
          )
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
                const over = !rules.caps.noPercentLimits && s.percent > limit;
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
        description="Cada comprovante lançado no SALIC. Use a chave “Conta p/ vínculo” para tirar (ou incluir) um pagamento da soma do vínculo com o proponente."
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
                <th className="text-right">Conta p/ vínculo</th>
              </tr>
            </thead>
            <tbody>
              {paymentsPage.slice.map((p) => (
                <tr key={p.id} className={p.countsForBond ? undefined : "text-[var(--gray-500)]"}>
                  <td>{formatDate(p.paymentDate)}</td>
                  <td>{p.supplierName}</td>
                  <td>
                    <span>{p.itemName || "—"}</span>
                    {!p.countsForBond ? (
                      <div className="text-sm text-[var(--gray-500)]">
                        Não conta para o vínculo
                        {p.bondMarkedByHand ? " (desligado à mão)" : " (alimentação/refeição)"}
                      </div>
                    ) : p.bondMarkedByHand ? (
                      <div className="text-sm text-[var(--gray-500)]">Conta para o vínculo (ligado à mão)</div>
                    ) : null}
                  </td>
                  <td>
                    {p.documentType || "—"}
                    {p.documentNumber ? ` nº ${p.documentNumber}` : ""}
                  </td>
                  <td className={p.countsForBond ? "font-semibold text-[var(--navy)]" : "font-semibold"}>
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="text-right">
                    <Switch
                      size="sm"
                      checked={p.countsForBond}
                      disabled={!projectId || savingPayment !== null}
                      onChange={(next) => toggleCounts(p, next)}
                      label={`Pagamento de ${formatCurrency(p.amount)} a ${p.supplierName} conta para o vínculo`}
                    />
                  </td>
                </tr>
              ))}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-[var(--gray-500)]">
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
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {bondError ? <p className="mt-2 text-sm text-[#8a4b12]">{bondError}</p> : null}
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
