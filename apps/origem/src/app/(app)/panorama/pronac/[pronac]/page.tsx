import Link from "next/link";
import {
  formatPercent,
  getPronacDetail,
  getWatchedSupplierCount,
  listWatchedSuppliers,
} from "@/lib/audit";
import { evaluatePronacSupplierCompliance } from "@/lib/compliance/rouanet";
import { loadComplianceBundle, metaForAccount } from "@/lib/compliance/context";
import { listRulesets, rulesForProject } from "@/lib/compliance/rules";
import type { AuditBrief } from "@/lib/compliance/audit-brief";
import { formatCurrency } from "@/lib/crypto";
import { getWorkspaceContext } from "@/lib/auth/session";
import { ComplianceAlerts } from "@/components/ComplianceAlerts";
import { FieldHelp, FieldLabel } from "@/components/FieldHelp";
import { PageHeader, StatCard } from "@/components/ui";
import { PronacDetailTables } from "@/components/PronacDetailTables";
import { ObservadoBondsPanel } from "@/components/ObservadoBondsPanel";
import { ProjectCompliancePanel } from "@/components/ProjectCompliancePanel";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { HELP } from "@/lib/help";
import { normalizeCgccpf } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = Promise<{ pronac: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type DetailTab = "analise" | "avisos" | "in";

function parseTab(value: string | undefined): DetailTab {
  if (value === "avisos" || value === "in") return value;
  return "analise";
}

export default async function PronacDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { pronac } = await params;
  const sp = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const workspaceId = entitlements.workspaceId;
  const accountId = typeof sp.accountId === "string" ? sp.accountId : undefined;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const tab = parseTab(typeof sp.tab === "string" ? sp.tab : undefined);
  const watchedCount = await getWatchedSupplierCount(workspaceId);
  const watchedOnly =
    sp.watchedOnly === "1" || sp.watchedOnly === "on";

  const [detail, watchedSuppliers] = await Promise.all([
    getPronacDetail(pronac, {
      accountId,
      from,
      to,
      watchedOnly,
      workspaceId,
    }),
    listWatchedSuppliers(workspaceId),
  ]);

  const baseQuery = new URLSearchParams();
  if (accountId) baseQuery.set("accountId", accountId);
  if (from) baseQuery.set("from", from);
  if (to) baseQuery.set("to", to);
  baseQuery.set("watchedOnly", watchedOnly ? "1" : "0");

  function hrefForTab(next: DetailTab) {
    const q = new URLSearchParams(baseQuery);
    if (next === "analise") q.delete("tab");
    else q.set("tab", next);
    return `?${q.toString()}`;
  }

  const backQs = baseQuery.toString();
  const reportQs = `?${baseQuery.toString()}`;

  const primaryAccountId = accountId || detail.accounts[0]?.id;
  const catalog = await listRulesets();
  const projectRules = await rulesForProject(
    {
      complianceRulesetId: detail.compliance?.rulesetId,
    },
  );

  const bundle = await loadComplianceBundle(
    primaryAccountId ? [primaryAccountId] : detail.accounts.map((a) => a.id),
    { workspaceId: entitlements.workspaceId },
  );
  const meta = metaForAccount(
    bundle,
    primaryAccountId,
    projectRules.version,
  );
  const accountCgccpf = detail.accounts[0]?.cgccpf || null;
  const personType = meta.personType || detail.accounts[0]?.personType;

  const pronacDocs = new Set(
    detail.allSuppliers.map((s) => normalizeCgccpf(s.cgccpf)).filter(Boolean),
  );
  const watchedInPronac = watchedSuppliers.filter((w) => {
    const dig = normalizeCgccpf(w.cgccpf || "");
    return dig.length >= 11 && pronacDocs.has(dig);
  });

  const complianceAlerts = evaluatePronacSupplierCompliance({
    pronac: detail.pronac,
    projectName: detail.name,
    projectTotal: detail.projectTotal,
    accountCgccpf,
    personType,
    relatedParties: meta.relatedParties,
    rules: projectRules,
    suppliers: detail.allSuppliers,
    bondSuppliers: detail.bondSuppliers,
  });

  const brief = (detail.compliance?.auditBrief || null) as AuditBrief | null;
  const criticalCount = complianceAlerts.filter((a) => a.level === "critical").length;
  const attentionCount = complianceAlerts.filter((a) => a.level === "attention").length;
  const briefCount =
    (brief?.problems?.length || 0) + (brief?.recommendations?.length || 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/panorama/pronac?${backQs}`}
          className="text-sm text-[var(--gray-500)] hover:text-[var(--navy)]"
        >
          ← Voltar à análise por PRONAC
        </Link>
      </div>

      <PageHeader
        breadcrumb="Início › Panorama › PRONAC › Detalhe"
        title={`PRONAC ${detail.pronac}`}
        description={
          detail.name
            ? `${detail.name}${detail.accounts[0] ? ` · ${detail.accounts[0].name}` : ""}`
            : detail.accounts.map((a) => a.name).join(", ") || undefined
        }
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <ReportDownloadButton
              href={`/api/reports/pronac/${detail.pronac}${reportQs}`}
              label="Gerar relatório PDF"
            />
            <form className="flex flex-wrap items-end gap-2">
              {accountId && <input type="hidden" name="accountId" value={accountId} />}
              {from && <input type="hidden" name="from" value={from} />}
              {to && <input type="hidden" name="to" value={to} />}
              {tab !== "analise" && <input type="hidden" name="tab" value={tab} />}
              <div className="field">
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
              <button type="submit" className="btn">
                Aplicar
              </button>
            </form>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--gray-500)]">
        <Link
          href={hrefForTab("in")}
          className="badge badge-warn hover:opacity-90"
          title="Abrir IN e briefing"
        >
          {projectRules.sourceCode}
        </Link>
        <Link
          href={hrefForTab("avisos")}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-[var(--gray-50)]"
        >
          <span className="font-medium text-[var(--navy)]">
            {complianceAlerts.length === 0
              ? "Sem avisos"
              : `${complianceAlerts.length} aviso${complianceAlerts.length === 1 ? "" : "s"}`}
          </span>
          {criticalCount > 0 ? (
            <span className="text-xs text-[#b42318]">{criticalCount} crítico(s)</span>
          ) : attentionCount > 0 ? (
            <span className="text-xs text-[#c05621]">{attentionCount} atenção</span>
          ) : null}
        </Link>
        <FieldHelp text={HELP.alerts} />
      </div>

      <nav className="accounts-tabs" aria-label="Abas do PRONAC">
        <Link href={hrefForTab("analise")} aria-current={tab === "analise" ? "page" : undefined}>
          Análise
        </Link>
        <Link href={hrefForTab("avisos")} aria-current={tab === "avisos" ? "page" : undefined}>
          Avisos
          {complianceAlerts.length > 0 ? ` (${complianceAlerts.length})` : ""}
        </Link>
        <Link href={hrefForTab("in")} aria-current={tab === "in" ? "page" : undefined}>
          IN e briefing
          {briefCount > 0 ? ` (${briefCount})` : ""}
        </Link>
      </nav>

      {tab === "analise" && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Valor captado"
              value={formatCurrency(detail.projectTotal)}
              hint={
                detail.baseSource === "comprovado"
                  ? "Captado indisponível — usando soma dos comprovados"
                  : `Comprovado: ${formatCurrency(detail.paidTotal)}`
              }
              help={HELP.valorCaptado}
            />
            {detail.watchedOnly ? (
              <>
                <StatCard
                  label="Total observados"
                  value={formatCurrency(detail.total)}
                  hint={`${formatPercent(detail.total, detail.projectTotal)} do captado`}
                  help={HELP.totalObservados}
                />
                <StatCard
                  label="Observados neste PRONAC"
                  value={String(detail.supplierCount)}
                />
              </>
            ) : (
              <StatCard
                label="Comprovado (pagamentos)"
                value={formatCurrency(detail.paidTotal)}
                hint={`${formatPercent(detail.paidTotal, detail.projectTotal)} do captado`}
              />
            )}
            <StatCard label="Pagamentos exibidos" value={String(detail.paymentCount)} />
          </section>

          {primaryAccountId ? (
            <ObservadoBondsPanel
              salicAccountId={primaryAccountId}
              accountName={detail.accounts[0]?.name || "Proponente"}
              rulesetVersion={projectRules.version}
              rulesetSourceCode={projectRules.sourceCode}
              watched={watchedInPronac.map((w) => ({
                id: w.id,
                name: w.name,
                label: w.label,
                cgccpf: w.cgccpf,
              }))}
              enabledDocs={meta.relatedParties.map((r) =>
                normalizeCgccpf(r.cgccpf),
              )}
            />
          ) : null}

          <PronacDetailTables
            pronac={detail.pronac}
            projectTotal={detail.projectTotal}
            paidTotal={detail.paidTotal}
            accountId={accountId}
            accountCgccpf={accountCgccpf}
            personType={personType}
            relatedParties={meta.relatedParties}
            rules={projectRules}
            watchedOnly={detail.watchedOnly}
            suppliers={detail.suppliers}
            allSuppliers={detail.allSuppliers}
            bondSuppliers={detail.bondSuppliers}
            watchedSuppliers={watchedInPronac}
            payments={detail.payments.map((p) => ({
              id: p.id,
              paymentDate: p.paymentDate?.toISOString() ?? null,
              supplierName: p.supplier.name,
              itemName: p.itemName,
              documentType: p.documentType,
              documentNumber: p.documentNumber,
              amount: Number(p.amount),
              source: p.source,
            }))}
          />
        </>
      )}

      {tab === "avisos" && (
        <section className="card p-5">
          <h2 className="text-base font-semibold text-[var(--navy)]">
            Avisos de conformidade
            <span className="ml-2 text-sm font-medium text-[var(--gray-400)]">
              · {projectRules.sourceCode}
            </span>
          </h2>
          <p className="mt-1 mb-4 text-sm text-[var(--gray-500)]">
            {complianceAlerts.length === 0
              ? "Nenhum alerta neste PRONAC"
              : [
                  criticalCount ? `${criticalCount} crítico${criticalCount > 1 ? "s" : ""}` : null,
                  attentionCount ? `${attentionCount} atenção` : null,
                  `${complianceAlerts.length} no total`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
          <ComplianceAlerts alerts={complianceAlerts} rules={projectRules} />
        </section>
      )}

      {tab === "in" &&
        (detail.projectId ? (
          <ProjectCompliancePanel
            pronac={detail.pronac}
            projectId={detail.projectId}
            currentVersion={detail.compliance?.version || null}
            currentSourceCode={projectRules.sourceCode}
            rationale={detail.compliance?.rationale || null}
            source={detail.compliance?.source || null}
            brief={brief}
            recommendedVersion={brief?.recommendedRulesetVersion || null}
            rulesets={catalog.map((r) => ({
              version: r.version,
              sourceCode: r.sourceCode,
              proponentCapPct: r.caps.proponentCapPct,
              supplierCapPct: r.caps.supplierCapPct,
            }))}
          />
        ) : (
          <section className="card p-5">
            <p className="text-sm text-[var(--gray-500)]">
              Projeto ainda sem vínculo de IN no MAX Origem.
            </p>
          </section>
        ))}
    </div>
  );
}
