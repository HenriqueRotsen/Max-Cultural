import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAuthEnabled } from "@/lib/auth/config";
import { getHubSessionPayload, origemHubLoginUrl } from "@/lib/auth/hub";
import {
  entitlementsFromWorkspace,
  type PlanEntitlements,
} from "@/lib/auth/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createWorkspace, ensureBootstrapWorkspace } from "@/lib/auth/workspace";
import type { AppUser, AppUserRole, Workspace } from "@/generated/prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  profile: AppUser;
  workspace: Workspace;
  entitlements: PlanEntitlements;
};

export type WorkspaceContext = {
  session: SessionUser | null;
  workspace: Workspace;
  entitlements: PlanEntitlements;
};

export async function ensureAppUser(params: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<AppUser & { workspace: Workspace }> {
  const email = params.email.toLowerCase();
  const existing = await prisma.appUser.findUnique({
    where: { id: params.id },
    include: { workspace: true },
  });

  if (existing) {
    const data: { email?: string; name?: string | null } = {};
    if (existing.email !== email) data.email = email;
    if (params.name && params.name !== existing.name) data.name = params.name;
    if (Object.keys(data).length > 0) {
      return prisma.appUser.update({
        where: { id: params.id },
        data,
        include: { workspace: true },
      });
    }
    return existing;
  }

  const workspace = await createWorkspace({
    name: params.name || email.split("@")[0] || "Workspace",
    plan: "ESSENTIAL",
    maxAccounts: 1,
  });

  return prisma.appUser.create({
    data: {
      id: params.id,
      email,
      name: params.name || null,
      role: "USER",
      mustChangePassword: false,
      active: true,
      workspaceId: workspace.id,
    },
    include: { workspace: true },
  });
}

async function ensureHubAppUser(params: { id: string; email: string }) {
  const email = params.email.toLowerCase();
  const name = email.split("@")[0] || "MAX Cultural";
  const workspace = await ensureBootstrapWorkspace();

  const byEmail = await prisma.appUser.findUnique({
    where: { email },
    include: { workspace: true },
  });
  if (byEmail) {
    if (byEmail.mustChangePassword || !byEmail.active) {
      return prisma.appUser.update({
        where: { id: byEmail.id },
        data: { mustChangePassword: false, active: true },
        include: { workspace: true },
      });
    }
    return byEmail;
  }

  try {
    return await prisma.appUser.upsert({
      where: { id: params.id },
      create: {
        id: params.id,
        email,
        name,
        role: "USER",
        mustChangePassword: false,
        active: true,
        workspaceId: workspace.id,
      },
      update: {
        email,
        name,
        mustChangePassword: false,
        active: true,
      },
      include: { workspace: true },
    });
  } catch {
    const fallback = await prisma.appUser.findFirst({
      where: { OR: [{ id: params.id }, { email }] },
      include: { workspace: true },
    });
    if (fallback) return fallback;
    throw new Error("Não foi possível vincular a sessão do hub ao Origem.");
  }
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // SSO do hub tem prioridade: login único no Cultural.
  const hub = await getHubSessionPayload();
  if (hub?.email) {
    try {
      const profile = await ensureHubAppUser({
        id: hub.userId,
        email: hub.email,
      });
      if (profile?.active) {
        return {
          id: profile.id,
          email: profile.email,
          profile,
          workspace: profile.workspace,
          entitlements: entitlementsFromWorkspace(profile.workspace),
        };
      }
    } catch {
      // Continua para Supabase local se o provisionamento do hub falhar.
    }
  }

  if (isAuthEnabled()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user?.email) {
      const profile = await ensureAppUser({
        id: user.id,
        email: user.email,
        name: (user.user_metadata?.name as string | undefined) || null,
      });
      if (!profile.active) return null;
      return {
        id: user.id,
        email: user.email,
        profile,
        workspace: profile.workspace,
        entitlements: entitlementsFromWorkspace(profile.workspace),
      };
    }
  }

  return null;
});

/** Contexto do workspace atual (Auth ou hub SSO). */
export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const session = await getSessionUser();
  if (!session) redirect(origemHubLoginUrl("/painel"));
  return {
    session,
    workspace: session.workspace,
    entitlements: session.entitlements,
  };
}

export async function requireUser(options?: { roles?: AppUserRole[] }) {
  const session = await getSessionUser();
  if (!session) redirect(origemHubLoginUrl("/painel"));
  if (session.profile.mustChangePassword && isAuthEnabled()) redirect("/alterar-senha");
  if (options?.roles && !options.roles.includes(session.profile.role)) {
    redirect("/painel");
  }
  return session;
}

export async function requireAdmin() {
  return requireUser({ roles: ["ADMIN"] });
}
