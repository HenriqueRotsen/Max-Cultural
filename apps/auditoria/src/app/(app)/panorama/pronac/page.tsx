import Link from "next/link";
import { formatCurrency } from "@/lib/crypto";
import {
  getPronacPanorama,
  getWatchedSupplierCount,
  listProjectsWithoutPayments,
} from "@/lib/audit";
import { SITUACAO_BADGE, situacaoLabel } from "@/lib/salic/situacao-label";
import {
  evaluatePronacSupplierCompliance,
} from "@/lib/compliance/rouanet";
import { loadComplianceBundle, metaForAccount } from "@/lib/compliance/context";
import { getPendingRulesetReview } from "@/lib/compliance/rules";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { CollapsibleAlertsPanel } from "@/components/CollapsibleAlertsPanel";
import { FieldHelp } from "@/components/FieldHelp";
import { PageHeader } from "@/components/ui";
import { PronacPanoramaTable } from "@/components/PronacPanoramaTable";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { HELP } from "@/lib/help";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PronacPanoramaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const workspaceId = entitlements.workspaceId;
  const accountId = typeof sp.accountId === "string" ? sp.accountId : undefined;
  const pronac = typeof sp.pronac === "string" ? sp.pronac : undefined;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const watchedCount = await getWatchedSupplierCount(workspaceId);
  // Só observados apenas quando pedido — o padrão mostra todos os fornecedores.
  const watchedOnly = sp.watchedOnly === "1" || sp.watchedOnly === "on";

  const [accounts, rows, pendingReview, withoutPayments] = await Promise.all([
    prisma.salicAccount.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
    }),
    getPronacPanorama({ accountId, pronac, from, to, watchedOnly, workspaceId }),
    getPendingRulesetReview(),
    listProjectsWithoutPayments({ accountId, pronac, workspaceId }),
  ]);

  const bundle = await loadComplianceBundle(
    accountId ? [accountId] : [...new Set(rows.map((r) => r.accountId))],
    { workspaceId },
  );

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const reportQs = new URLSearchParams();
  if (accountId) reportQs.set("accountId", accountId);
  if (pronac) reportQs.set("pronac", pronac);
  if (from) reportQs.set("from", from);
  if (to) reportQs.set("to", to);
  reportQs.set("watchedOnly", watchedOnly ? "1" : "0");

  const complianceAlerts = rows
    .flatMap((row) => {
      const meta = metaForAccount(bundle, row.accountId, row.rules.version);
      return evaluatePronacSupplierCompliance({
        pronac: row.pronac,
        projectName: row.name,
        projectTotal: row.projectTotal,
        accountCgccpf: row.accountCgccpf,
        personType: meta.personType || row.personType,
        relatedParties: meta.relatedParties,
        rules: row.rules,
        suppliers: row.allBySupplier,
        bondSuppliers: row.bondBySupplier,
      });
    })
    .sort((a, b) => (b.percent || 0) - (a.percent || 0))
    .slice(0, 20);

  const tableRows = rows.map((row) => {
    const detailQs = new URLSearchParams();
    if (accountId) detailQs.set("accountId", accountId);
    if (from) detailQs.set("from", from);
    if (to) detailQs.set("to", to);
    if (watchedOnly) detailQs.set("watchedOnly", "1");
    const meta = metaForAccount(bundle, row.accountId, row.rules.version);
    return {
      projectId: row.projectId,
      pronac: row.pronac,
      name: row.name,
      situacao: row.situacao,
      accountName: row.accountName,
      accountCgccpf: row.accountCgccpf,
      personType: meta.personType || row.personType,
      relatedParties: meta.relatedParties,
      rules: row.rules,
      rulesetSourceCode: row.rulesetSourceCode,
      rulesetSourceUrl: row.rulesetSourceUrl,
      projectTotal: row.projectTotal,
      paidTotal: row.paidTotal,
      total: row.total,
      paymentCount: row.paymentCount,
      supplierCount: row.supplierCount,
      bySupplier: row.bySupplier,
      allBySupplier: row.allBySupplier,
      bondBySupplier: row.bondBySupplier,
      href: `/panorama/pronac/${row.pronac}?${detailQs.toString()}`,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Por PRONAC"
        description="Veja se cada projeto respeita os limites da IN. Os que precisam de atenção aparecem primeiro; clique em um projeto para abrir a análise completa."
        actions={
          <ReportDownloadButton href={`/api/reports/pronac?${reportQs.toString()}`} />
        }
      />

      {pendingReview && (
        <p className="rounded-xl border border-[var(--gold-border)] bg-[var(--gold-soft)] px-4 py-3 text-[0.95rem] text-[var(--navy)]">
          <span className="inline-flex items-center gap-1.5">
            As regras oficiais mudaram e precisam de revisão antes de valerem nos avisos (
            {pendingReview.sourceCode}).
            <FieldHelp text={HELP.pendingNorm} />
          </span>
        </p>
      )}

      <PronacPanoramaTable
        rows={tableRows}
        watchedOnly={watchedOnly}
        watchedCount={watchedCount}
        rules={bundle.rules}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        accountId={accountId}
        from={from}
        to={to}
      />

      {withoutPayments.length > 0 ? (
        <details className="more-filters rounded-xl border border-[var(--border)] bg-white px-5 py-3">
          <summary>
            {withoutPayments.length === 1
              ? "1 projeto ainda sem pagamentos não aparece na lista"
              : `${withoutPayments.length} projetos ainda sem pagamentos não aparecem na lista`}
          </summary>
          <p className="mt-2 text-[0.95rem] text-[var(--gray-600)]">
            Sem pagamento não há o que analisar. Eles entram aqui assim que o SALIC
            registrar o primeiro pagamento.
          </p>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {withoutPayments.map((p) => {
              const sit = situacaoLabel(p.situacao);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-semibold text-[var(--navy)]">{p.pronac}</span>
                    <span className="ml-2 text-[0.95rem] text-[var(--gray-600)]">{p.name || "Sem nome"}</span>
                  </span>
                  {sit ? (
                    <span
                      className={`badge ${SITUACAO_BADGE[sit.tone]}`}
                      title={`${sit.code ? `${sit.code} · ` : ""}${sit.detail}`}
                    >
                      {sit.label}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      <CollapsibleAlertsPanel
        title="Todos os avisos"
        alerts={complianceAlerts}
        perProjectRules
      />

      <p className="text-[0.95rem] text-[var(--gray-500)]">
        Total pago nos PRONACs listados: {formatCurrency(grandTotal)}
        {watchedOnly ? " (só observados)" : ""}. Para acompanhar fornecedores
        específicos, cadastre-os em{" "}
        <Link href="/observados" className="font-semibold text-[var(--navy)] underline underline-offset-2">
          Observados
        </Link>
        .
      </p>
    </div>
  );
}
