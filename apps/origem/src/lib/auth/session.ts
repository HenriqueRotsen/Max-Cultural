import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAuthEnabled, needsLogin } from "@/lib/auth/config";
import { getHubSessionPayload } from "@/lib/auth/hub";
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

export async function getSessionUser(): Promise<SessionUser | null> {
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
  if (!hub) return null;
  const workspace = await ensureBootstrapWorkspace();
  const email = hub.email || "sessao@maxcultural.com.br";
  return {
    id: `hub:${hub.userId}`,
    email,
    profile: {
      id: `hub:${hub.userId}`,
      email,
      name: "MAX Cultural",
      role: "USER",
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
    } as AppUser,
    workspace,
    entitlements: entitlementsFromWorkspace(workspace),
  };
}

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
  if (!session) redirect("/login");
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
  if (!session) redirect("/login");
  if (session.profile.mustChangePassword) redirect("/alterar-senha");
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
