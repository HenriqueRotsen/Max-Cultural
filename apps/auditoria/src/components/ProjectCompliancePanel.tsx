"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AuditBrief } from "@/lib/compliance/audit-brief";

type RulesetOption = {
  version: string;
  sourceCode: string;
  proponentCapPct: number;
  supplierCapPct: number;
};

export function ProjectCompliancePanel({
  pronac,
  projectId,
  currentVersion,
  currentSourceCode,
  rationale,
  source,
  brief,
  rulesets,
  recommendedVersion,
}: {
  pronac: string;
  projectId: string;
  currentVersion: string | null;
  currentSourceCode: string;
  rationale: string | null;
  source: string | null;
  brief: AuditBrief | null;
  rulesets: RulesetOption[];
  recommendedVersion: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [version, setVersion] = useState(currentVersion || "");
  const [msg, setMsg] = useState<string | null>(null);

  function saveRuleset() {
    if (!version) return;
    startTransition(async () => {
      setMsg(null);
      const res = await fetch("/api/compliance/project-ruleset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, rulesetVersion: version, action: "set" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(data.error || "Falha ao salvar IN");
        return;
      }
      setMsg("IN atualizada.");
      router.refresh();
    });
  }

  function refreshBrief() {
    startTransition(async () => {
      setMsg(null);
      const res = await fetch("/api/compliance/project-ruleset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "refresh-brief" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(data.error || "Falha ao atualizar briefing");
        return;
      }
      setMsg("Briefing atualizado.");
      router.refresh();
    });
  }

  function chooseNow() {
    startTransition(async () => {
      setMsg(null);
      const res = await fetch("/api/compliance/project-ruleset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "ensure" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(data.error || "Falha na análise");
        return;
      }
      setMsg("Análise concluída.");
      router.refresh();
    });
  }

  const problems = brief?.problems || [];
  const recommendations = brief?.recommendations || [];
  const sourceLabel =
    source === "manual"
      ? "manual"
      : source === "ai"
        ? "automática (legado)"
        : source === "default"
          ? "automática"
          : source;

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--navy)]">Instrução normativa</h2>
            <p className="mt-1 text-sm text-[var(--gray-500)]">
              PRONAC {pronac}
              {sourceLabel ? ` · origem ${sourceLabel}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!currentVersion && (
              <button
                type="button"
                className="btn btn-gold"
                disabled={pending}
                onClick={chooseNow}
              >
                {pending ? "Analisando…" : "Analisar IN"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={refreshBrief}
            >
              Atualizar briefing
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-warn">{currentSourceCode}</span>
          {recommendedVersion && recommendedVersion !== currentVersion ? (
            <span className="badge badge-success">
              Sugerida:{" "}
              {rulesets.find((r) => r.version === recommendedVersion)?.sourceCode ||
                recommendedVersion}
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="field">
            <label htmlFor="rulesetVersion" className="text-sm font-medium text-[var(--navy)]">
              Alterar IN
            </label>
            <select
              id="rulesetVersion"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={pending}
            >
              <option value="">Selecione…</option>
              {rulesets.map((r) => (
                <option key={r.version} value={r.version}>
                  {r.sourceCode} · prop. {r.proponentCapPct}% · forn. {r.supplierCapPct}%
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="btn"
              disabled={pending || !version}
              onClick={saveRuleset}
            >
              Salvar IN
            </button>
          </div>
        </div>

        {msg ? <p className="text-sm text-[var(--navy)]">{msg}</p> : null}

        {rationale ? (
          <details className="rounded-xl bg-[var(--gray-50)] px-4 py-3 text-sm text-[var(--gray-600)]">
            <summary className="cursor-pointer font-medium text-[var(--navy)]">
              Fundamentação da escolha
            </summary>
            <p className="mt-2 whitespace-pre-wrap">{rationale}</p>
          </details>
        ) : null}
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">Briefing de auditoria</h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            {problems.length === 0 && recommendations.length === 0
              ? "Sem destaques no momento"
              : [
                  problems.length
                    ? `${problems.length} problema${problems.length === 1 ? "" : "s"}`
                    : null,
                  recommendations.length === 1
                    ? "1 recomendação"
                    : recommendations.length > 1
                      ? `${recommendations.length} recomendações`
                      : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>

        {brief?.auditContextNotes ? (
          <p className="text-xs text-[var(--gray-500)]">{brief.auditContextNotes}</p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--navy)]">Problemas</h3>
            {problems.length === 0 ? (
              <p className="text-sm text-[var(--gray-500)]">Nenhum.</p>
            ) : (
              <ul className="space-y-2">
                {problems.map((p) => (
                  <li
                    key={p.code + p.title}
                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-[var(--navy)]">
                      <span className="mr-2 text-xs uppercase text-[var(--gray-500)]">
                        {p.severity}
                      </span>
                      {p.title}
                    </p>
                    <p className="mt-1 text-[var(--gray-600)]">{p.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--navy)]">Recomendações</h3>
            {recommendations.length === 0 ? (
              <p className="text-sm text-[var(--gray-500)]">Nenhuma.</p>
            ) : (
              <ul className="space-y-2">
                {recommendations.map((r) => (
                  <li
                    key={r.code + r.title}
                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-[var(--navy)]">
                      {r.category === "corporate_structure" ? (
                        <span className="mr-2 rounded bg-[var(--gold-soft)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--navy)]">
                          {r.title.toLowerCase().includes("organizacional")
                            ? "Quadro organizacional"
                            : "Quadro societário"}
                        </span>
                      ) : null}
                      {r.title}
                    </p>
                    <p className="mt-1 text-[var(--gray-600)]">{r.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {brief?.alternatives && brief.alternatives.length > 0 ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--navy)]">Alternativas de IN</h3>
            <ul className="space-y-1 text-sm text-[var(--gray-600)]">
              {brief.alternatives.map((a) => (
                <li key={a.version}>
                  <strong className="text-[var(--navy)]">
                    {rulesets.find((r) => r.version === a.version)?.sourceCode || a.version}
                  </strong>{" "}
                  <span className="tabular-nums text-[var(--navy)]">
                    (
                    {a.probability % 1 === 0
                      ? a.probability.toFixed(0)
                      : a.probability.toFixed(1)}
                    %)
                  </span>{" "}
                  — {a.why}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
