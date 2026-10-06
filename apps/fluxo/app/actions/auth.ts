"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  getSessionUser,
} from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { fluxoHubLoginUrl, fluxoHubLogoutUrl } from "@/lib/hub";
import { prisma } from "@/lib/prisma";
import { hashPassword, randomToken } from "@/lib/password";

export type AuthActionState = {
  error?: string;
  ok?: boolean;
  message?: string;
};

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Login local removido — sempre pelo MAX Cultural. */
export async function loginAction(): Promise<AuthActionState> {
  redirect(fluxoHubLoginUrl("/dashboard"));
}

export async function logoutAction() {
  const user = await getSessionUser();
  await clearSessionCookie();
  if (user) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.logout",
      ip: await clientIp(),
    });
  }
  redirect(fluxoHubLogoutUrl());
}

/**
 * Provisiona usuário local do Fluxo (RBAC/escopos).
 * Sem senha/e-mail: o acesso é pelo login do MAX Cultural com o mesmo e-mail.
 */
export async function createLocalFluxoUser(input: {
  email: string;
  name: string;
  roleId: string;
  dataScopeMode: "ALL" | "LIMITED";
  createdById: string;
}) {
  const passwordHash = await hashPassword(randomToken());
  const user = await prisma.user.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash,
      roleId: input.roleId,
      dataScopeMode: input.dataScopeMode,
      mustChangePassword: false,
      totpEnabled: false,
      createdById: input.createdById,
    },
  });
  return { user };
}
