import Link from "next/link";
import { getSupplierDetail } from "@/lib/audit";
import { formatCurrency, formatCgccpf, normalizeCgccpf } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { SupplierPaymentsTable } from "@/components/SupplierPaymentsTable";

export const dynamic = "force-dynamic";

type Params = Promise<{ supplierId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { supplierId } = await params;
  const sp = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const accountId = typeof sp.accountId === "string" ? sp.accountId : undefined;
  const pronac = typeof sp.pronac === "string" ? sp.pronac : undefined;
  const fromFornecedores = sp.from === "fornecedores";
  const fromCatalog = sp.from === "catalog";

  const detail = await getSupplierDetail(supplierId, {
    accountId,
    pronac,
    workspaceId: entitlements.workspaceId,
  });

  const reportQs = new URLSearchParams();
  if (accountId) reportQs.set("accountId", accountId);
  if (pronac) reportQs.set("pronac", pronac);
  const reportHref = `/api/reports/supplier/${supplierId}${
    reportQs.toString() ? `?${reportQs.toString()}` : ""
  }`;

  const catalog = await prisma.catalogSupplier.findUnique({
    where: {
      workspaceId_cnpj: {
        workspaceId: entitlements.workspaceId,
        cnpj: normalizeCgccpf(detail.supplier.cgccpf),
      },
    },
    select: { id: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={
            fromCatalog
              ? "/fornecedores/empresas"
              : fromFornecedores
                ? "/fornecedores/empresas"
                : "/panorama"
          }
          className="text-sm text-[var(--gray-500)] hover:text-[var(--navy)]"
        >
          {fromCatalog
            ? "← Voltar ao banco de preços"
            : fromFornecedores
              ? "← Voltar ao banco de preços"
              : "← Voltar aos insights"}
        </Link>
      </div>

      <PageHeader
        breadcrumb={
          fromCatalog
            ? "Fornecedores › Auditoria › Detalhe"
            : fromFornecedores
              ? "Início › Observados › Detalhe"
              : "Início › Panorama › Detalhe"
        }
        title={detail.supplier.name}
        description={`CNPJ/CPF ${formatCgccpf(detail.supplier.cgccpf)} · ${formatCurrency(detail.total)} · ${detail.payments.length} pagamentos`}
        actions={
          <>
            <Link
              href={
                catalog
                  ? `/fornecedores/empresas/${catalog.id}`
                  : `/fornecedores/empresas?q=${normalizeCgccpf(detail.supplier.cgccpf)}`
              }
              className="btn btn-ghost"
            >
              Banco de preços
            </Link>
            <ReportDownloadButton href={reportHref} label="Gerar relatório PDF" />
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-base font-semibold text-[var(--navy)]">Por PRONAC</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {detail.byPronac.map((p) => (
              <li
                key={p.pronac}
                className="flex justify-between gap-4 border-b border-[var(--border)] py-2"
              >
                <span>
                  <Link
                    href={`/panorama/pronac/${p.pronac}`}
                    className="font-semibold text-[var(--navy)] underline-offset-2 hover:underline"
                  >
                    {p.pronac}
                  </Link>
                  {p.name ? ` — ${p.name}` : ""}
                  {p.rulesetSourceCode ? (
                    p.rulesetSourceUrl ? (
                      <a
                        href={p.rulesetSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block text-xs font-medium text-[var(--navy)] underline-offset-2 hover:underline"
                      >
                        {p.rulesetSourceCode}
                      </a>
                    ) : (
                      <span className="mt-0.5 block text-xs text-[var(--gray-500)]">
                        {p.rulesetSourceCode}
                      </span>
                    )
                  ) : null}
                </span>
                <span className="font-medium">
                  {formatCurrency(p.total)} ({p.count})
                </span>
              </li>
            ))}
            {detail.byPronac.length === 0 && (
              <li className="text-[var(--gray-500)]">Nenhum pagamento neste filtro.</li>
            )}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-base font-semibold text-[var(--navy)]">Por proponente</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {detail.byAccount.map((a) => (
              <li
                key={a.accountId}
                className="flex justify-between gap-4 border-b border-[var(--border)] py-2"
              >
                <span>{a.name}</span>
                <span className="font-medium">
                  {formatCurrency(a.total)} ({a.count})
                </span>
              </li>
            ))}
            {detail.byAccount.length === 0 && (
              <li className="text-[var(--gray-500)]">Nenhum pagamento neste filtro.</li>
            )}
          </ul>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--navy)]">Linhas de pagamento</h2>
          <ReportDownloadButton href={reportHref} label="Baixar PDF" />
        </div>
        <SupplierPaymentsTable
          payments={detail.payments.map((p) => ({
            id: p.id,
            paymentDate: p.paymentDate?.toISOString() ?? null,
            pronac: p.project.pronac,
            accountName: p.project.salicAccount.name,
            itemName: p.itemName,
            documentType: p.documentType,
            documentNumber: p.documentNumber,
            amount: Number(p.amount),
            source: p.source,
          }))}
        />
      </section>
    </div>
  );
}
