import { prisma } from "@/lib/db";
import {
  accountLimitMessage,
  entitlementsFromWorkspace,
  syncBlockedMessage,
  type PlanEntitlements,
} from "@/lib/auth/entitlements";
import type { AppPlan, Workspace } from "@/generated/prisma/client";

export const BOOTSTRAP_WORKSPACE_ID = "ws_bootstrap_local";

/** Workspace legado/local (Pro) quando Auth não está configurado. */
export async function ensureBootstrapWorkspace(): Promise<Workspace> {
  return prisma.workspace.upsert({
    where: { id: BOOTSTRAP_WORKSPACE_ID },
    create: {
      id: BOOTSTRAP_WORKSPACE_ID,
      name: "MAX Origem",
      plan: "PRO",
      maxAccounts: 100,
    },
    update: {},
  });
}

export async function createWorkspace(params: {
  name: string;
  plan: AppPlan;
  maxAccounts?: number;
}): Promise<Workspace> {
  const maxAccounts =
    params.plan === "ESSENTIAL" ? 1 : Math.max(1, params.maxAccounts ?? 10);
  return prisma.workspace.create({
    data: {
      name: params.name.trim() || "Workspace",
      plan: params.plan,
      maxAccounts,
    },
  });
}

export async function assertAccountInWorkspace(accountId: string, workspaceId: string) {
  const account = await prisma.salicAccount.findFirst({
    where: { id: accountId, workspaceId },
  });
  if (!account) {
    throw new Error("Conta não encontrada neste espaço");
  }
  return account;
}

export async function assertCanCreateAccount(entitlements: PlanEntitlements) {
  const count = await prisma.salicAccount.count({
    where: { workspaceId: entitlements.workspaceId },
  });
  if (count >= entitlements.maxAccounts) {
    throw new Error(accountLimitMessage(entitlements.maxAccounts));
  }
}

export async function assertCanSync(entitlements: PlanEntitlements) {
  if (!entitlements.syncEnabled) {
    throw new Error(syncBlockedMessage());
  }
}

export async function workspaceAccountIds(workspaceId: string): Promise<string[]> {
  const rows = await prisma.salicAccount.findMany({
    where: { workspaceId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export { entitlementsFromWorkspace };
