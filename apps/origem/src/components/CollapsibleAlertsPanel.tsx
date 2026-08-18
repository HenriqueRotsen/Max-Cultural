"use client";

import { useMemo, useState } from "react";
import type { ActiveRules } from "@/lib/compliance/defaults";
import type { ComplianceAlert } from "@/lib/compliance/rouanet";
import { ComplianceAlerts } from "@/components/ComplianceAlerts";
import { FieldHelp } from "@/components/FieldHelp";
import { HELP } from "@/lib/help";

export function CollapsibleAlertsPanel({
  title,
  alerts,
  rules,
  /** Lista com INs distintas por PRONAC — não mostra uma única IN no título. */
  perProjectRules = false,
}: {
  title?: string;
  alerts: ComplianceAlert[];
  rules?: ActiveRules;
  perProjectRules?: boolean;
}) {
  const heading = title || "Avisos de conformidade";
  const critical = useMemo(
    () => alerts.filter((a) => a.level === "critical").length,
    [alerts],
  );
  const attention = useMemo(
    () => alerts.filter((a) => a.level === "attention").length,
    [alerts],
  );
  const info = useMemo(
    () => alerts.filter((a) => a.level === "info").length,
    [alerts],
  );

  const uniqueRules = useMemo(() => {
    const codes = [
      ...new Set(alerts.map((a) => a.sourceCode).filter(Boolean) as string[]),
    ];
    return codes;
  }, [alerts]);

  const defaultCollapsed = alerts.length > 2;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const summary =
    alerts.length === 0
      ? "Nenhum alerta"
      : [
          critical ? `${critical} crítico${critical > 1 ? "s" : ""}` : null,
          attention ? `${attention} atenção` : null,
          info ? `${info} informativo${info > 1 ? "s" : ""}` : null,
          `${alerts.length} no total`,
          perProjectRules && uniqueRules.length > 0
            ? `${uniqueRules.length} IN${uniqueRules.length === 1 ? "" : "s"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const headingRuleset =
    !perProjectRules && rules?.sourceCode
      ? rules.sourceCode
      : !perProjectRules && uniqueRules.length === 1
        ? uniqueRules[0]
        : null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-1.5 text-base font-semibold text-[var(--navy)]">
            {heading}
            {headingRuleset ? (
              <span className="text-sm font-medium text-[var(--gray-400)]">
                · {headingRuleset}
              </span>
            ) : null}
            <FieldHelp text={HELP.alerts} />
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">{summary}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          {collapsed ? "Expandir avisos" : "Recolher avisos"}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-4">
          <ComplianceAlerts
            alerts={alerts}
            rules={rules}
            perProjectRules={perProjectRules}
          />
        </div>
      )}
    </section>
  );
}
