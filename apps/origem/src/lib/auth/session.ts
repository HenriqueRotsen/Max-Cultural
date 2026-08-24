import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAuthEnabled, needsLogin } from "@/lib/auth/config";
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

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function ensureAppUser(params: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<AppUser & { workspace: Workspace }> {
  const email = params.email.toLowerCase();
  const isAdmin = adminEmails().has(email);
  const existing = await prisma.appUser.findUnique({
    where: { id: params.id },
    include: { workspace: true },
  });

  if (existing) {
    const data: { role?: AppUserRole; email?: string; name?: string | null } = {};
    if (isAdmin && existing.role !== "ADMIN") data.role = "ADMIN";
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

  const workspace = isAdmin
    ? await ensureBootstrapWorkspace()
    : await createWorkspace({
        name: params.name || email.split("@")[0] || "Workspace",
        plan: "ESSENTIAL",
        maxAccounts: 1,
      });

  return prisma.appUser.create({
    data: {
      id: params.id,
      email,
      name: params.name || null,
      role: isAdmin ? "ADMIN" : "USER",
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
        role: "ADMIN",
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
  if (!needsLogin()) {
    return null;
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

  const hub = await getHubSessionPayload();
  if (!hub?.email) return null;
  const profile = await ensureHubAppUser({
    id: hub.userId,
    email: hub.email,
  });
  if (!profile?.active) return null;
  return {
    id: profile.id,
    email: profile.email,
    profile,
    workspace: profile.workspace,
    entitlements: entitlementsFromWorkspace(profile.workspace),
  };
});

/** Contexto do workspace atual (Auth, hub ou bootstrap local). */
export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  if (!needsLogin()) {
    const workspace = await ensureBootstrapWorkspace();
    return {
      session: null,
      workspace,
      entitlements: entitlementsFromWorkspace(workspace),
    };
  }

  const session = await getSessionUser();
  if (!session) redirect(origemHubLoginUrl("/painel"));
  return {
    session,
    workspace: session.workspace,
    entitlements: session.entitlements,
  };
}

export async function requireUser(options?: { roles?: AppUserRole[] }) {
  if (!needsLogin()) {
    const workspace = await ensureBootstrapWorkspace();
    const email = process.env.ADMIN_EMAILS?.split(",")[0]?.trim() || "dev@localhost";
    return {
      id: "dev-open",
      email,
      profile: {
        id: "dev-open",
        email,
        name: "Dev",
        role: "ADMIN" as const,
        mustChangePassword: false,
        active: true,
        contactEmail: email,
        contactPhone: "",
        addressZip: "",
        addressStreet: "",
        addressNumber: "",
        addressComplement: null,
        addressNeighborhood: "",
        addressCity: "",
        addressState: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: null,
        workspaceId: workspace.id,
      },
      workspace,
      entitlements: entitlementsFromWorkspace(workspace),
    } satisfies SessionUser;
  }

  const session = await getSessionUser();
  if (!session) redirect(origemHubLoginUrl("/painel"));
  if (session.profile.mustChangePassword && isAuthEnabled()) redirect("/alterar-senha");
  if (options?.roles && !options.roles.includes(session.profile.role)) {
    redirect("/painel");
  }
  return session;
}

export async function requireAdmin() {
  const { isDemoMode } = await import("@/lib/auth/config");
  if (isDemoMode()) redirect("/painel");
  return requireUser({ roles: ["ADMIN"] });
}
