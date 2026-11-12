import Link from "next/link";
import { SearchSelect } from "@max/ui";
import {
  getPronacDetail,
  getWatchedSupplierCount,
  listWatchedSuppliers,
} from "@/lib/audit";
import {
  computeProponentGroupShare,
  evaluatePronacSupplierCompliance,
  nearThresholdForLimit,
  proponentLimitPct,
} from "@/lib/compliance/rouanet";
import { loadComplianceBundle, metaForProject } from "@/lib/compliance/context";
import { listRulesets, rulesForProject } from "@/lib/compliance/rules";
import type { AuditBrief } from "@/lib/compliance/audit-brief";
import { formatCurrency } from "@/lib/crypto";
import { paymentCountsForBond } from "@/lib/compliance/rouanet";
import { getWorkspaceContext } from "@/lib/auth/session";
import { ComplianceAlerts } from "@/components/ComplianceAlerts";
import { FieldLabel } from "@/components/FieldHelp";
import { PageHeader, Section, StatCard, StatusBanner } from "@/components/ui";
import { PronacDetailTables } from "@/components/PronacDetailTables";
import { VinculoSection } from "@/components/VinculoSection";
import { ProjectCompliancePanel } from "@/components/ProjectCompliancePanel";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { HELP } from "@/lib/help";
import { normalizeCgccpf } from "@/lib/format";
import { RELATION_LABELS } from "@/lib/compliance/defaults";
import { SITUACAO_BADGE, situacaoLabel } from "@/lib/salic/situacao-label";
import { hiddenProjectIds, notFoundIfHiddenPronac } from "@/lib/compliance/over-limit-visibility";
import { prisma } from "@/lib/db";
import { pronacYear } from "@/lib/compliance/choose-ruleset";
import { mapWindowForProject, periodsInYears } from "@/lib/corporate/at-year";
import { CorporateMapYearChip } from "@/components/CorporateMapYearChip";

export const dynamic = "force-dynamic";

type Params = Promise<{ pronac: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type DetailTab = "analise" | "avisos" | "in";

function parseTab(value: string | undefined): DetailTab {
  if (value === "avisos" || value === "in") return value;
  return "analise";
}

/** Intervalos do mapa no formato do selo "Sócios em…". */
function toChipPeriods(
  periods: Array<{
    validFrom: Date;
    validFromPrecision: "DAY" | "MONTH" | "YEAR";
    validTo: Date | null;
    validToPrecision: "DAY" | "MONTH" | "YEAR";
    members: Array<{ name: string; role: string; sharePct: unknown; notes: string | null }>;
  }>,
) {
  return periods.map((p) => ({
    validFrom: p.validFrom.toISOString(),
    validFromPrecision: p.validFromPrecision,
    validTo: p.validTo?.toISOString() ?? null,
    validToPrecision: p.validToPrecision,
    members: p.members.map((m) => ({
      name: m.name,
      role: m.role,
      sharePct: m.sharePct != null ? Number(m.sharePct) : null,
      notes: m.notes,
    })),
  }));
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

  await notFoundIfHiddenPronac(pronac);
  const hidden = await hiddenProjectIds();
  const [detail, watchedSuppliers] = await Promise.all([
    getPronacDetail(pronac, {
      accountId,
      from,
      to,
      watchedOnly,
      workspaceId,
      hiddenProjectIds: hidden,
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
  const meta = metaForProject(bundle, primaryAccountId, detail.projectId);
  const accountCgccpf = detail.accounts[0]?.cgccpf || null;

  // Mapa do período em que os pagamentos aconteceram (mesma base de datas da IN);
  // sem pagamentos, o ano do PRONAC. Considera todos os pagamentos, sem os filtros da tela.
  const paymentRange = detail.projectId
    ? await prisma.payment.aggregate({
        where: { projectId: detail.projectId, paymentDate: { not: null } },
        _min: { paymentDate: true },
        _max: { paymentDate: true },
      })
    : null;
  const mapWindow = mapWindowForProject({
    pronacYear: pronacYear(detail.pronac),
    firstPayment: paymentRange?._min.paymentDate,
    lastPayment: paymentRange?._max.paymentDate,
  });
  const mapAccount = primaryAccountId
    ? await prisma.salicAccount.findFirst({
        where: { id: primaryAccountId, workspaceId },
        select: {
          id: true,
          institutionalMap: true,
          corporatePeriods: {
            include: { members: { orderBy: { name: "asc" } } },
          },
        },
      })
    : null;
  const mapPeriods = mapAccount
    ? toChipPeriods(
        periodsInYears(mapAccount.corporatePeriods, mapWindow.fromYear, mapWindow.toYear),
      )
    : [];
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

  const limitPct = proponentLimitPct(projectRules, personType);
  const accountDoc = accountCgccpf ? normalizeCgccpf(accountCgccpf) : "";
  const bondAmountByDoc = new Map(
    detail.bondSuppliers.map((s) => [normalizeCgccpf(s.cgccpf), s.total]),
  );
  // Recebido neste PRONAC que não conta para o vínculo (alimentação/refeição ou desligado).
  const paidAmountByDoc = new Map(
    detail.allSuppliers.map((s) => [normalizeCgccpf(s.cgccpf), s.total]),
  );
  const ignoredFor = (dig: string) =>
    Math.max(0, (paidAmountByDoc.get(dig) || 0) - (bondAmountByDoc.get(dig) || 0));
  const enabledBondDocs = meta.relatedParties.map((r) => normalizeCgccpf(r.cgccpf));
  const enabledSet = new Set(enabledBondDocs);
  // Sócios das empresas observadas nos mesmos anos do mapa do proponente.
  const watchedCompanyIds = watchedInPronac
    .filter((w) => normalizeCgccpf(w.cgccpf || "").length === 14)
    .map((w) => w.id);
  const watchedMaps = watchedCompanyIds.length
    ? await prisma.corporatePeriod.findMany({
        where: { watchedSupplierId: { in: watchedCompanyIds } },
        include: { members: { orderBy: { name: "asc" } } },
      })
    : [];
  const vinculoRows = watchedInPronac
    .map((w) => normalizeCgccpf(w.cgccpf || ""))
    .filter((dig, i, all) => dig.length >= 11 && dig !== accountDoc && all.indexOf(dig) === i)
    .map((dig) => {
      const w = watchedInPronac.find((x) => normalizeCgccpf(x.cgccpf || "") === dig)!;
      return {
        cgccpf: dig,
        name: w.name,
        amount: bondAmountByDoc.get(dig) || 0,
        ignoredAmount: ignoredFor(dig),
        enabled: enabledSet.has(dig),
        corporateMap:
          dig.length === 14 ? (
            <CorporateMapYearChip
              href={`/observados/${w.id}/mapa`}
              ownerName={w.name}
              label={mapWindow.label}
              basis={mapWindow.basis}
              institutional={false}
              periods={toChipPeriods(
                periodsInYears(
                  watchedMaps.filter((p) => p.watchedSupplierId === w.id),
                  mapWindow.fromYear,
                  mapWindow.toYear,
                ),
              )}
            />
          ) : null,
      };
    })
    .sort((a, b) => b.amount - a.amount);
  const group = computeProponentGroupShare({
    projectTotal: detail.projectTotal,
    accountCgccpf,
    personType,
    suppliers: detail.bondSuppliers,
    relatedParties: meta.relatedParties,
    rules: projectRules,
  });
  const groupPct = group ? group.percent : 0;
  const pctText = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;
  const levelRank = { critical: 0, attention: 1, info: 2 } as Record<string, number>;
  const topAlerts = [...complianceAlerts]
    .filter((a) => a.level !== "info")
    .sort((a, b) => (levelRank[a.level] ?? 3) - (levelRank[b.level] ?? 3))
    .slice(0, 3);
  const noLimits = Boolean(projectRules.caps.noPercentLimits);
  const situacao = situacaoLabel(detail.situacao);
  const statusTone = noLimits
    ? "neutral"
    : criticalCount > 0 ? "critical" : attentionCount > 0 ? "attention" : "ok";

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/panorama/pronac?${backQs}`}
        backLabel="Voltar para a lista de PRONACs"
        title={`PRONAC ${detail.pronac}`}
        description={
          <>
            {detail.name
              ? `${detail.name}${detail.accounts[0] ? ` · ${detail.accounts[0].name}` : ""}`
              : detail.accounts.map((a) => a.name).join(", ") || null}
            {situacao ? (
              <span className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-[var(--gray-500)]">Situação no SALIC:</span>
                <span className={`badge ${SITUACAO_BADGE[situacao.tone]}`}>{situacao.label}</span>
                <span className="text-[var(--gray-500)]">
                  {situacao.code ? `${situacao.code} · ` : ""}
                  {situacao.detail}
                  {detail.lastSyncedAt
                    ? ` · atualizado em ${detail.lastSyncedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                    : ""}
                </span>
              </span>
            ) : null}
          </>
        }
        actions={
          <ReportDownloadButton
            href={`/api/reports/pronac/${detail.pronac}${reportQs}`}
            label="Gerar relatório PDF"
          />
        }
      />

      <StatusBanner
        tone={statusTone}
        title={
          statusTone === "critical"
            ? "Este PRONAC passou de um limite"
            : statusTone === "attention"
              ? "Este PRONAC está perto de um limite"
              : noLimits
                ? "Esta IN não tem limites percentuais"
                : "Este PRONAC está dentro dos limites"
        }
      >
        {topAlerts.length > 0 ? (
          <ul className="mb-1 list-disc space-y-0.5 pl-5">
            {topAlerts.map((a, i) => (
              <li key={`${a.code}-${i}`}>{a.title}</li>
            ))}
          </ul>
        ) : null}
        <p>
          {noLimits ? (
            <>Os valores aparecem só para consulta, sem “acima” ou “perto” do limite</>
          ) : (
            <>
              Soma do vínculo com o proponente: <strong>{pctText(groupPct)}</strong> de {limitPct}% permitido
            </>
          )}
          {" · "}Regra aplicada: {projectRules.sourceCode}
          {complianceAlerts.length > 0 ? (
            <>
              {" · "}
              <Link href={hrefForTab("avisos")} className="font-semibold underline underline-offset-2">
                {complianceAlerts.length === 1 ? "ver o aviso" : `ver os ${complianceAlerts.length} avisos`}
              </Link>
            </>
          ) : null}
        </p>
      </StatusBanner>

      <nav className="accounts-tabs" aria-label="Abas do PRONAC">
        <Link href={hrefForTab("analise")} aria-current={tab === "analise" ? "page" : undefined}>
          Análise
        </Link>
        <Link href={hrefForTab("avisos")} aria-current={tab === "avisos" ? "page" : undefined}>
          Avisos
          {complianceAlerts.length > 0 ? ` (${complianceAlerts.length})` : ""}
        </Link>
        <Link href={hrefForTab("in")} aria-current={tab === "in" ? "page" : undefined}>
          Regra aplicada (IN)
          {briefCount > 0 ? ` (${briefCount})` : ""}
        </Link>
      </nav>

      {tab === "analise" && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Valor captado"
              value={formatCurrency(detail.projectTotal)}
              hint={
                detail.baseSource === "comprovado"
                  ? "Captado indisponível: usando a soma dos pagamentos"
                  : "Base de todos os limites"
              }
              help={HELP.valorCaptado}
            />
            <StatCard
              label="Já pago"
              value={formatCurrency(detail.paidTotal)}
              hint={`${pctText(detail.projectTotal > 0 ? (detail.paidTotal / detail.projectTotal) * 100 : 0)} do captado`}
            />
            <StatCard
              label="Pagamentos"
              value={String(detail.paymentCount)}
              hint={`${detail.allSuppliers.length} fornecedor${detail.allSuppliers.length === 1 ? "" : "es"}`}
            />
          </section>

          <VinculoSection
            step={1}
            projectId={detail.projectId}
            rulesetSourceCode={projectRules.sourceCode}
            accountName={detail.accounts[0]?.name || "Proponente"}
            proponentAmount={accountDoc ? bondAmountByDoc.get(accountDoc) || 0 : 0}
            proponentIgnoredAmount={accountDoc ? ignoredFor(accountDoc) : 0}
            corporateMap={
              mapAccount ? (
                <CorporateMapYearChip
                  accountId={mapAccount.id}
                  ownerName={detail.accounts[0]?.name}
                  label={mapWindow.label}
                  basis={mapWindow.basis}
                  institutional={mapAccount.institutionalMap}
                  periods={mapPeriods}
                />
              ) : null
            }
            projectTotal={detail.projectTotal}
            limitPct={limitPct}
            noLimits={noLimits}
            nearPct={nearThresholdForLimit(limitPct, projectRules)}
            rows={vinculoRows}
            bondRelations={projectRules.caps.relationRules.countsTowardProponentCap.map(
              (r) => RELATION_LABELS[r],
            )}
            artisticGroupException={projectRules.caps.relationRules.artisticGroupException}
          />

          <PronacDetailTables
            firstStep={2}
            pronac={detail.pronac}
            projectId={detail.projectId}
            projectTotal={detail.projectTotal}
            accountId={accountId}
            accountCgccpf={accountCgccpf}
            personType={personType}
            bondDocs={enabledBondDocs}
            rules={projectRules}
            watchedOnly={detail.watchedOnly}
            suppliers={detail.suppliers}
            filterSlot={
              <form className="flex flex-wrap items-end gap-2">
                {accountId && <input type="hidden" name="accountId" value={accountId} />}
                {from && <input type="hidden" name="from" value={from} />}
                {to && <input type="hidden" name="to" value={to} />}
                <div className="field">
                  <FieldLabel htmlFor="watchedOnly" help={HELP.watchedOnly}>
                    Mostrar
                  </FieldLabel>
                  <SearchSelect
                    id="watchedOnly"
                    name="watchedOnly"
                    defaultValue={watchedOnly ? "1" : "0"}
                    options={[
                      { value: "0", label: "Todos os fornecedores" },
                      {
                        value: "1",
                        label: `Só observados${watchedCount > 0 ? ` (${watchedCount})` : " (nenhum cadastrado)"}`,
                        disabled: watchedCount === 0,
                      },
                    ]}
                  />
                </div>
                <button type="submit" className="btn btn-ghost">
                  Aplicar
                </button>
              </form>
            }
            payments={detail.payments.map((p) => ({
              id: p.id,
              paymentDate: p.paymentDate?.toISOString() ?? null,
              supplierName: p.supplier.name,
              itemName: p.itemName,
              documentType: p.documentType,
              documentNumber: p.documentNumber,
              amount: Number(p.amount),
              source: p.source,
              countsForBond: paymentCountsForBond(p),
              bondMarkedByHand: p.countsForBond != null,
            }))}
          />
        </>
      )}

      {tab === "avisos" && (
        <Section
          title="Avisos de conformidade"
          description={
            complianceAlerts.length === 0
              ? `Nenhum problema encontrado pelas regras da ${projectRules.sourceCode}.`
              : `Pontos que passaram ou estão perto dos limites da ${projectRules.sourceCode}. Vermelho é o que passou do limite; amarelo, o que está perto.`
          }
        >
          {complianceAlerts.length > 0 ? (
            <ComplianceAlerts alerts={complianceAlerts} rules={projectRules} />
          ) : null}
        </Section>
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
              noPercentLimits: Boolean(r.caps.noPercentLimits),
              supplierCapPct: r.caps.supplierCapPct,
            }))}
          />
        ) : (
          <Section
            title="Regra aplicada (IN)"
            description="Este projeto ainda não tem uma IN definida. Ela é escolhida na próxima atualização do SALIC."
          />
        ))}
    </div>
  );
}
