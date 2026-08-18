import type { ActiveRules } from "@/lib/compliance/defaults";
import { DEFAULT_RULES } from "@/lib/compliance/defaults";
import type { ComplianceAlert, PersonTypeInput } from "@/lib/compliance/rouanet";
import { legalBasisNote, isNearLimit, proponentLimitPct } from "@/lib/compliance/rouanet";
import { FieldHelp } from "@/components/FieldHelp";
import { HELP } from "@/lib/help";

export function ComplianceAlerts({
  alerts,
  compact = false,
  rules = DEFAULT_RULES,
  perProjectRules = false,
}: {
  alerts: ComplianceAlert[];
  compact?: boolean;
  rules?: ActiveRules;
  perProjectRules?: boolean;
}) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm text-[var(--navy)]">
        <p className="inline-flex items-center gap-1.5 font-semibold">
          Conformidade com as regras
          <FieldHelp text={HELP.alerts} />
        </p>
        <p className="mt-1 text-[var(--gray-500)]">
          {perProjectRules
            ? "Nenhum fornecedor acima do teto da IN vinculada a cada PRONAC no filtro."
            : `Nenhum fornecedor acima de ${rules.caps.supplierCapPct}% do total pago neste projeto. Base: ${rules.sourceCode}.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!compact && !perProjectRules && (
        <p className="text-xs text-[var(--gray-500)]">{legalBasisNote(rules)}</p>
      )}
      {alerts.map((alert) => {
        const tone =
          alert.level === "critical"
            ? "border-[#f2c7c7] bg-[#fdecec]"
            : alert.level === "attention"
              ? "border-[#e5d3bb] bg-[var(--gold-soft)]"
              : "border-[var(--border)] bg-[var(--navy-soft)]";
        return (
          <div
            key={`${alert.code}-${alert.pronac}-${alert.supplierName}-${alert.sourceCode || ""}`}
            className={`rounded-xl border px-4 py-3 text-sm text-[var(--navy)] ${tone}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">{alert.title}</p>
              <div className="flex flex-wrap gap-1.5">
                {typeof alert.percent === "number" ? (
                  <span className="badge badge-warn">
                    {alert.members
                      ? `Soma ${alert.percent.toFixed(4).replace(".", ",")}%`
                      : `${alert.percent.toFixed(4).replace(".", ",")}%`}
                    {alert.limitPct ? ` / ${alert.limitPct}%` : ""}
                  </span>
                ) : null}
                {alert.pronac ? (
                  <span className="badge badge-muted">PRONAC {alert.pronac}</span>
                ) : null}
                {alert.sourceCode ? (
                  <span className="badge badge-warn">{alert.sourceCode}</span>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-[var(--gray-600)]">{alert.detail}</p>
            {alert.members && alert.members.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-[var(--border)]/60 pt-2 text-xs text-[var(--gray-600)]">
                {alert.members.map((m) => (
                  <li key={`${m.cgccpf}-${m.role}`} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {m.name}
                      <span className="ml-1 text-[var(--gray-400)]">
                        ({m.role === "proponent" ? "proponente" : "relacionado art. 23"})
                      </span>
                    </span>
                    <span className="font-medium text-[var(--navy)]">
                      {m.percent.toFixed(4).replace(".", ",")}%
                    </span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 border-t border-dashed border-[var(--border)] pt-1 font-semibold text-[var(--navy)]">
                  <span>Soma art. 23</span>
                  <span>
                    {(alert.percent || 0).toFixed(4).replace(".", ",")}%
                    {alert.limitPct ? ` (limite ${alert.limitPct}%)` : ""}
                  </span>
                </li>
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function LimitBadge({
  percent,
  isProponent = false,
  personType,
  rules = DEFAULT_RULES,
}: {
  percent: number;
  isProponent?: boolean;
  personType?: PersonTypeInput | null;
  rules?: ActiveRules;
}) {
  const limit = isProponent
    ? proponentLimitPct(rules, personType)
    : rules.caps.supplierCapPct;
  const over = percent > limit;
  const near = isNearLimit(percent, limit, rules);
  const cls = over
    ? "badge-danger"
    : near
      ? "badge-attention"
      : "badge-success";
  const label = over
    ? `> ${limit}%`
    : near
      ? `~${limit}%`
      : `≤ ${limit}%`;

  return (
    <span
      className={`badge ${cls}`}
      title={`${percent.toFixed(4).replace(".", ",")}% do total pago no projeto. ${HELP.limitBadge}`}
    >
      {label}
    </span>
  );
}
