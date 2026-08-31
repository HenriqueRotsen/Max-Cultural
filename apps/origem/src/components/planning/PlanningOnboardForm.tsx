"use client";

import { useActionState, useMemo, useState } from "react";
import {
  startPlanningProjectFederal,
} from "@/lib/planning/federal/actions";
import {
  startPlanningProjectState,
} from "@/lib/planning/estadual/actions";
import type { ActionState } from "@/lib/planning/action-state";
import { FluxoContextField } from "@/components/planning/FluxoContextField";

type Account = { id: string; name: string; cgccpf: string };
type Ruleset = { version: string; sourceCode: string; jurisdiction: string };

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const initial: ActionState = {};

export function PlanningOnboardForm({
  accounts,
  rulesets,
}: {
  accounts: Account[];
  rulesets: Ruleset[];
}) {
  const [mode, setMode] = useState<"FEDERAL" | "STATE">("FEDERAL");
  const [uf, setUf] = useState("SP");
  const [accountId, setAccountId] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [fedState, fedAction, fedPending] = useActionState(
    startPlanningProjectFederal,
    initial,
  );
  const [stState, stAction, stPending] = useActionState(
    startPlanningProjectState,
    initial,
  );

  const federalRules = useMemo(
    () => rulesets.filter((r) => r.jurisdiction === "FEDERAL"),
    [rulesets],
  );
  const stateRules = useMemo(() => {
    const exact = rulesets.filter((r) => r.jurisdiction === uf);
    return exact.length ? exact : federalRules;
  }, [rulesets, uf, federalRules]);

  const err = mode === "FEDERAL" ? fedState.error : stState.error;
  const pending = mode === "FEDERAL" ? fedPending : stPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={mode === "FEDERAL" ? "btn" : "btn-secondary"}
          onClick={() => setMode("FEDERAL")}
        >
          Federal (SALIC)
        </button>
        <button
          type="button"
          className={mode === "STATE" ? "btn" : "btn-secondary"}
          onClick={() => setMode("STATE")}
        >
          Estadual
        </button>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {err}
        </p>
      ) : null}

      {mode === "FEDERAL" ? (
        <form action={fedAction} className="card space-y-4 p-5">
          <p className="text-sm text-[var(--gray-500)]">
            Importa a planilha homologada do SALIC uma única vez com as credenciais do
            proponente.
          </p>
          <label className="field">
            <span>Proponente</span>
            <select
              name="accountId"
              required
              className="w-full"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.cgccpf})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Norma / IN</span>
            <select name="rulesetVersion" required className="w-full" defaultValue={federalRules[0]?.version || ""}>
              {federalRules.map((r) => (
                <option key={r.version} value={r.version}>
                  {r.sourceCode}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>PRONAC</span>
            <input
              name="externalCode"
              required
              placeholder="Ex.: 123456"
              className="w-full"
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
            />
          </label>
          <FluxoContextField
            accountId={accountId}
            projectCode={projectCode}
            disabled={!accountId || !projectCode.trim()}
          />
          <button type="submit" className="btn" disabled={pending || !accounts.length}>
            {pending ? "Importando do SALIC…" : "Iniciar e importar planilha"}
          </button>
        </form>
      ) : (
        <form action={stAction} className="card space-y-4 p-5">
          <p className="text-sm text-[var(--gray-500)]">
            Envie o arquivo da planilha homologada estadual (xlsx/csv/json) uma única vez.
          </p>
          <label className="field">
            <span>UF</span>
            <select
              name="jurisdiction"
              required
              className="w-full"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
            >
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Proponente</span>
            <select
              name="accountId"
              required
              className="w-full"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.cgccpf})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Norma</span>
            <select name="rulesetVersion" required className="w-full" defaultValue={stateRules[0]?.version || ""}>
              {stateRules.map((r) => (
                <option key={r.version} value={r.version}>
                  {r.sourceCode} ({r.jurisdiction})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Código do projeto</span>
            <input
              name="externalCode"
              required
              className="w-full"
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
            />
          </label>
          <FluxoContextField
            accountId={accountId}
            projectCode={projectCode}
            projectNameHint={projectCode}
            disabled={!accountId || !projectCode.trim()}
          />
          <label className="field">
            <span>Arquivo da planilha homologada</span>
            <input name="sheetFile" type="file" accept=".xlsx,.xls,.csv,.json" required />
          </label>
          <button type="submit" className="btn" disabled={pending || !accounts.length}>
            {pending ? "Importando…" : "Iniciar e importar arquivo"}
          </button>
        </form>
      )}
    </div>
  );
}
