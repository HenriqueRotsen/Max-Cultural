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
import { ProjectCapsFields } from "@/components/planning/ProjectCapsFields";

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
  const [stateName, setStateName] = useState("");
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
          <ProjectCapsFields />
          <label className="field">
            <span>Ano da IN (opcional, só informativo)</span>
            <select name="rulesetVersion" className="w-full" defaultValue="">
              <option value="">Não informar</option>
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
            Projeto estadual começa do zero: depois de criar, lance as rubricas (mesma estrutura do
            federal) e o valor captado no próprio projeto. Se já tiver a planilha num arquivo, pode
            importar (opcional).
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
          <ProjectCapsFields />
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
          <label className="field">
            <span>Nome do projeto</span>
            <input
              name="projectName"
              required
              className="w-full"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
            />
          </label>
          <FluxoContextField
            accountId={accountId}
            projectCode={projectCode}
            projectNameHint={stateName || projectCode}
            disabled={!accountId || !projectCode.trim()}
            skipSalic
          />
          <label className="field">
            <span>Arquivo da planilha (opcional)</span>
            <input name="sheetFile" type="file" accept=".xlsx,.xls,.csv,.json" />
          </label>
          <button type="submit" className="btn" disabled={pending || !accounts.length}>
            {pending ? "Criando…" : "Criar projeto estadual"}
          </button>
        </form>
      )}
    </div>
  );
}
