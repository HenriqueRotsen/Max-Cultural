import type { AppPlan, Workspace } from "@/generated/prisma/client";

export type PlanEntitlements = {
  workspaceId: string;
  workspaceName: string;
  plan: AppPlan;
  /** Limite efetivo de contas SALIC. */
  maxAccounts: number;
  /** Sync SALIC (manual + cron) só no Pro. */
  syncEnabled: boolean;
  planLabel: string;
};

export function entitlementsFromWorkspace(workspace: Workspace): PlanEntitlements {
  const syncEnabled = workspace.plan === "PRO";
  const maxAccounts = workspace.plan === "ESSENTIAL" ? 1 : Math.max(1, workspace.maxAccounts);

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    plan: workspace.plan,
    maxAccounts,
    syncEnabled,
    planLabel: workspace.plan === "PRO" ? "Pro" : "Essencial",
  };
}

export function syncBlockedMessage() {
  return "O plano Essencial não inclui atualização SALIC. Fale conosco para o plano Pro.";
}

export function accountLimitMessage(maxAccounts: number) {
  return maxAccounts <= 1
    ? "O plano Essencial permite apenas 1 conta. Fale conosco para o plano Pro."
    : `Limite de ${maxAccounts} contas do plano atingido. Fale conosco para ampliar.`;
}
