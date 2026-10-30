import Link from "next/link";
import { formatCurrency } from "@/lib/crypto";
import { getPronacPanorama, getWatchedSupplierCount } from "@/lib/audit";
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

  const [accounts, rows, pendingReview] = await Promise.all([
    prisma.salicAccount.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
    }),
    getPronacPanorama({ accountId, pronac, from, to, watchedOnly, workspaceId }),
    getPendingRulesetReview(),
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
