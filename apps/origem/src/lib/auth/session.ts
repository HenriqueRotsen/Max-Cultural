import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getHubSessionPayload, origemHubLoginUrl } from "@/lib/auth/hub";
import {
  entitlementsFromWorkspace,
  type PlanEntitlements,
} from "@/lib/auth/entitlements";
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

const HUB_USER_TTL_MS = 45_000;
const hubUserCache = new Map<
  string,
  { profile: AppUser & { workspace: Workspace }; at: number }
>();

async function ensureHubAppUser(params: { id: string; email: string }) {
  const email = params.email.toLowerCase();
  const cacheKey = `${params.id}:${email}`;
  const cached = hubUserCache.get(cacheKey);
  if (cached && Date.now() - cached.at < HUB_USER_TTL_MS && cached.profile.active) {
    return cached.profile;
  }

  const name = email.split("@")[0] || "MAX Cultural";

  const byEmail = await prisma.appUser.findUnique({
    where: { email },
    include: { workspace: true },
  });
  if (byEmail) {
    const profile =
      byEmail.mustChangePassword || !byEmail.active
        ? await prisma.appUser.update({
            where: { id: byEmail.id },
            data: { mustChangePassword: false, active: true },
            include: { workspace: true },
          })
        : byEmail;
    if (hubUserCache.size > 2000) hubUserCache.clear();
    hubUserCache.set(cacheKey, { profile, at: Date.now() });
    return profile;
  }

  try {
    const workspace = await ensureBootstrapWorkspace();
    const profile = await prisma.appUser.upsert({
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
    if (hubUserCache.size > 2000) hubUserCache.clear();
    hubUserCache.set(cacheKey, { profile, at: Date.now() });
    return profile;
  } catch {
    const fallback = await prisma.appUser.findFirst({
      where: { OR: [{ id: params.id }, { email }] },
      include: { workspace: true },
    });
    if (fallback) {
      if (hubUserCache.size > 2000) hubUserCache.clear();
      hubUserCache.set(cacheKey, { profile: fallback, at: Date.now() });
      return fallback;
    }
    throw new Error("Não foi possível vincular a sessão do hub ao Origem.");
  }
}

/** Login único no MAX Cultural: a sessão do Origem é o cookie SSO do hub. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const hub = await getHubSessionPayload();
  if (!hub?.email) return null;
  try {
    const profile = await ensureHubAppUser({ id: hub.userId, email: hub.email });
    if (!profile?.active) return null;
    return {
      id: profile.id,
      email: profile.email,
      profile,
      workspace: profile.workspace,
      entitlements: entitlementsFromWorkspace(profile.workspace),
    };
  } catch {
    return null;
  }
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
  if (options?.roles && !options.roles.includes(session.profile.role)) {
    redirect("/painel");
  }
  return session;
}

export async function requireAdmin() {
  return requireUser({ roles: ["ADMIN"] });
}
