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
  return "A atualização com o SALIC não está disponível neste workspace.";
}

export function accountLimitMessage(maxAccounts: number) {
  return maxAccounts <= 1
    ? "Já existe um proponente cadastrado. Remova um para cadastrar outro."
    : `Limite de ${maxAccounts} proponentes atingido.`;
}
