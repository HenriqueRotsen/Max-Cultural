/** Parâmetros legados de planning no ruleset JSON (ainda seedados; UI de rascunho removida). */

export type PlanningParams = {
  version?: string;
  adminCapPct?: number;
  [key: string]: unknown;
};

export const FEDERAL_ROUANET_PLANNING: PlanningParams = {
  version: "rouanet-in-29-2026",
  adminCapPct: 15,
};

export function parsePlanningParams(raw: unknown): PlanningParams | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as PlanningParams;
}

export function jurisdictionLabel(code: string) {
  if (code === "FEDERAL") return "Federal";
  return code;
}
