import Link from "next/link";
import { formatCurrency } from "@/lib/crypto";
import { formatCgccpf, normalizeCgccpf } from "@/lib/format";
import {
  getPronacPanorama,
  getWatchedSupplierCount,
  listWatchedSuppliers,
} from "@/lib/audit";
import {
  evaluatePronacSupplierCompliance,
} from "@/lib/compliance/rouanet";
import { loadComplianceBundle, metaForAccount } from "@/lib/compliance/context";
import { getPendingRulesetReview } from "@/lib/compliance/rules";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { CollapsibleAlertsPanel } from "@/components/CollapsibleAlertsPanel";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { FieldHelp, FieldLabel } from "@/components/FieldHelp";
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
  const watchedOnly =
    sp.watchedOnly === "1" || sp.watchedOnly === "on" || (sp.watchedOnly !== "0" && watchedCount > 0);

  const [accounts, rows, pendingReview, watchedSuppliers] = await Promise.all([
    prisma.salicAccount.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
    }),
    getPronacPanorama({ accountId, pronac, from, to, watchedOnly, workspaceId }),
    getPendingRulesetReview(),
    listWatchedSuppliers(workspaceId),
  ]);

  const bundle = await loadComplianceBundle(
    accountId ? [accountId] : [...new Set(rows.map((r) => r.accountId))],
    { workspaceId },
  );

  const filteredAccountMeta = accountId
    ? metaForAccount(bundle, accountId, bundle.rules.version)
    : null;
  const bondSetForFilter = new Set(
    (filteredAccountMeta?.relatedParties || []).map((r) =>
      normalizeCgccpf(r.cgccpf),
    ),
  );
  if (accountId) {
    const acct = accounts.find((a) => a.id === accountId);
    if (acct?.cgccpf) bondSetForFilter.add(normalizeCgccpf(acct.cgccpf));
  }

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
    detailQs.set("watchedOnly", "0");
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
        breadcrumb="Início › Panorama › PRONAC"
        title="Análise por PRONAC"
        description={
          watchedOnly && watchedCount > 0
            ? `Observados (${watchedCount}) · ${formatCurrency(grandTotal)}`
            : `Total ${formatCurrency(grandTotal)}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ReportDownloadButton href={`/api/reports/pronac?${reportQs.toString()}`} />
            <Link href="/observados" className="btn btn-ghost">
              Definir observados
            </Link>
            <Link href="/panorama" className="btn btn-ghost">
              Ver insights
            </Link>
          </div>
        }
      />

      {pendingReview && (
        <p className="rounded-xl border border-[#e5d3bb] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--navy)]">
          <span className="inline-flex items-center gap-1.5">
            As regras oficiais mudaram e precisam de revisão antes de valerem nos avisos (
            {pendingReview.sourceCode}).
            <FieldHelp text={HELP.pendingNorm} />
          </span>
        </p>
      )}

      <form className="card grid gap-4 p-5 md:grid-cols-4">
        <div className="field">
          <FieldLabel htmlFor="accountId" help={HELP.filterProponente}>
            Proponente
          </FieldLabel>
          <select id="accountId" name="accountId" defaultValue={accountId || ""}>
            <option value="">Todos</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <FieldLabel htmlFor="pronac" help={HELP.filterPronac}>
            PRONAC
          </FieldLabel>
          <input id="pronac" name="pronac" defaultValue={pronac || ""} placeholder="153774" />
        </div>
        <div className="field">
          <FieldLabel htmlFor="from" help={HELP.filterFrom}>
            De
          </FieldLabel>
          <input id="from" name="from" type="date" defaultValue={from || ""} />
        </div>
        <div className="field">
          <FieldLabel htmlFor="to" help={HELP.filterTo}>
            Até
          </FieldLabel>
          <input id="to" name="to" type="date" defaultValue={to || ""} />
        </div>
        <div className="field md:col-span-2">
          <FieldLabel htmlFor="watchedOnly" help={HELP.watchedOnly}>
            Fornecedores
          </FieldLabel>
          <select
            id="watchedOnly"
            name="watchedOnly"
            defaultValue={watchedOnly ? "1" : "0"}
          >
            <option value="0">Todos</option>
            <option value="1" disabled={watchedCount === 0}>
              Só observados{watchedCount > 0 ? ` (${watchedCount})` : " — cadastre antes"}
            </option>
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button type="submit" className="btn">
            Filtrar
          </button>
        </div>
      </form>

      {watchedCount === 0 && (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--navy)]">
          Para analisar só os fornecedores que você escolher, cadastre-os em{" "}
          <Link href="/observados" className="font-semibold underline underline-offset-2">
            Fornecedores
          </Link>{" "}
          e marque “Só fornecedores observados”.
        </p>
      )}

      <CollapsibleAlertsPanel
        title="Avisos de conformidade"
        alerts={complianceAlerts}
        perProjectRules
      />

      <CollapsibleSection
        title="Todos os observados"
        summary={
          watchedSuppliers.length === 0
            ? "Nenhum cadastrado"
            : `${watchedSuppliers.length} cadastrado${watchedSuppliers.length === 1 ? "" : "s"}`
        }
        expandLabel="Expandir lista"
        collapseLabel="Recolher lista"
        defaultOpen={false}
      >
        {watchedSuppliers.length === 0 ? (
          <p className="text-sm text-[var(--gray-500)]">Nenhum observado cadastrado.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Observado</th>
                  <th>CNPJ/CPF</th>
                  <th>Vínculo art. 23{accountId ? " (filtro)" : ""}</th>
                </tr>
              </thead>
              <tbody>
                {watchedSuppliers.map((w, i) => {
                  const dig = normalizeCgccpf(w.cgccpf || "");
                  const isBond = accountId && dig ? bondSetForFilter.has(dig) : false;
                  return (
                    <tr key={w.id}>
                      <td>{i + 1}</td>
                      <td>
                        <span className="font-semibold text-[var(--navy)]">{w.name}</span>
                        {w.label && w.label !== w.name ? (
                          <div className="text-xs text-[var(--gray-400)]">{w.label}</div>
                        ) : null}
                      </td>
                      <td>{formatCgccpf(w.cgccpf)}</td>
                      <td>
                        {!accountId ? (
                          <span className="text-[var(--gray-400)]">Ver no PRONAC</span>
                        ) : isBond ? (
                          <span className="text-xs font-medium text-[var(--navy)]">Sim</span>
                        ) : (
                          <span className="text-[var(--gray-400)]">Não</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <div className="card p-5">
        <PronacPanoramaTable rows={tableRows} watchedOnly={watchedOnly} rules={bundle.rules} />
      </div>
    </div>
  );
}
