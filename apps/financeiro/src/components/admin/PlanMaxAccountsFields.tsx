"use client";

import { useState } from "react";

type Props = {
  /** Prefixo para ids únicos (ex.: workspace id). */
  idSuffix?: string;
  defaultPlan?: "ESSENTIAL" | "PRO";
  defaultMaxAccounts?: number;
  planLabel?: string;
  maxLabel?: string;
  /** Textos das opções do select (create vs edit). */
  compactOptions?: boolean;
};

export function PlanMaxAccountsFields({
  idSuffix = "",
  defaultPlan = "ESSENTIAL",
  defaultMaxAccounts = 10,
  planLabel = "Plano",
  maxLabel = "Máx. contas (Pro)",
  compactOptions = false,
}: Props) {
  const [plan, setPlan] = useState<"ESSENTIAL" | "PRO">(defaultPlan);
  const [maxAccounts, setMaxAccounts] = useState(
    defaultPlan === "ESSENTIAL" ? 1 : Math.max(1, defaultMaxAccounts),
  );
  const isEssential = plan === "ESSENTIAL";
  const planId = `plan${idSuffix ? `-${idSuffix}` : ""}`;
  const maxId = `maxAccounts${idSuffix ? `-${idSuffix}` : ""}`;

  return (
    <>
      <div className="field">
        <label htmlFor={planId}>{planLabel}</label>
        <select
          id={planId}
          name="plan"
          value={plan}
          onChange={(e) => {
            const next = e.target.value === "PRO" ? "PRO" : "ESSENTIAL";
            setPlan(next);
            if (next === "ESSENTIAL") {
              setMaxAccounts(1);
            } else if (maxAccounts < 2) {
              setMaxAccounts(Math.max(2, defaultMaxAccounts));
            }
          }}
        >
          <option value="ESSENTIAL">
            {compactOptions ? "Essencial" : "Essencial (1 conta, sem sync)"}
          </option>
          <option value="PRO">
            {compactOptions ? "Pro" : "Pro (sync + várias contas)"}
          </option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={maxId}>{maxLabel}</label>
        <input
          id={maxId}
          name="maxAccounts"
          type="number"
          min={1}
          value={isEssential ? 1 : maxAccounts}
          disabled={isEssential}
          aria-disabled={isEssential}
          title={isEssential ? "No Essencial o limite é sempre 1 conta" : undefined}
          onChange={(e) => {
            const n = Number(e.target.value);
            setMaxAccounts(Number.isFinite(n) && n >= 1 ? n : 1);
          }}
        />
        {isEssential && <input type="hidden" name="maxAccounts" value="1" />}
      </div>
    </>
  );
}
