import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import {
  AUTH_COOKIE,
  MAX_AGE_SECONDS,
  PENDING_2FA_COOKIE,
  PENDING_2FA_MAX_AGE,
  createPending2faToken,
  createSessionToken,
  parsePending2faToken,
  parseSessionToken,
  verifySessionToken,
} from "@/lib/auth-token";
import {
  AUTH_COOKIE as HUB_COOKIE,
  parseSessionToken as parseHubSession,
} from "@max/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, randomToken } from "@/lib/password";
import { ADMIN_ROLE_NAME, type PermissionCode } from "@/lib/permission-catalog";
import {
  getEffectivePermissions,
  type AuthUser,
} from "@/lib/permissions";
import { is2faDisabled } from "@/lib/totp";

export {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  verifySessionToken,
  createSessionToken,
  parseSessionToken,
  createPending2faToken,
  parsePending2faToken,
} from "@/lib/auth-token";

export type SessionUser = AuthUser;

const userInclude = {
  role: { select: { id: true, name: true } },
} as const;

function cookieOpts(maxAge: number) {
  const domain = (process.env.AUTH_COOKIE_DOMAIN || "").trim();
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

export async function setSessionCookie(user: {
  id: string;
  sessionVersion: number;
}) {
  const jar = await cookies();
  jar.set(AUTH_COOKIE, await createSessionToken({
    userId: user.id,
    sessionVersion: user.sessionVersion,
  }), cookieOpts(MAX_AGE_SECONDS));
  jar.delete(PENDING_2FA_COOKIE);
}

export async function setPending2faCookie(userId: string) {
  const jar = await cookies();
  jar.set(PENDING_2FA_COOKIE, await createPending2faToken(userId), cookieOpts(PENDING_2FA_MAX_AGE));
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  jar.delete(PENDING_2FA_COOKIE);
}

export async function clearPending2faCookie() {
  const jar = await cookies();
  jar.delete(PENDING_2FA_COOKIE);
}

/** Memoizado por request (RSC) — evita 2–3 queries de usuário no mesmo render. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const parsed = await parseSessionToken(jar.get(AUTH_COOKIE)?.value);
  if (parsed) {
    const user = await prisma.user.findUnique({
      where: { id: parsed.userId },
      include: userInclude,
    });
    if (user && !user.deactivatedAt && user.sessionVersion === parsed.sessionVersion) {
      return user;
    }
  }

  const hubUrl = (process.env.NEXT_PUBLIC_CULTURAL_URL || "").trim();
  if (!hubUrl || !process.env.AUTH_SECRET) return null;
  let hub = null;
  try {
    hub = await parseHubSession(jar.get(HUB_COOKIE)?.value);
  } catch {
    return null;
  }
  const email = hub?.email?.trim().toLowerCase();
  if (!email) return null;
  return ensureUserFromHub({
    email,
    name: email.split("@")[0] || "MAX Cultural",
  });
});

async function ensureUserFromHub(input: {
  email: string;
  name: string;
}): Promise<SessionUser | null> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    include: userInclude,
  });
  if (existing) {
    if (existing.deactivatedAt) return null;
    if (existing.mustChangePassword) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { mustChangePassword: false, lastLoginAt: new Date() },
        include: userInclude,
      });
    }
    return existing;
  }

  const adminRole = await prisma.role.findUnique({
    where: { name: ADMIN_ROLE_NAME },
  });
  if (!adminRole) return null;

  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(randomToken()),
      roleId: adminRole.id,
      isSuperAdmin: false,
      mustChangePassword: false,
      totpEnabled: false,
      lastLoginAt: new Date(),
    },
    include: userInclude,
  });
}

export async function getPending2faUser(): Promise<User | null> {
  const jar = await cookies();
  const parsed = await parsePending2faToken(jar.get(PENDING_2FA_COOKIE)?.value);
  if (!parsed) return null;
  const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
  if (!user || user.deactivatedAt) return null;
  return user;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSessionUser()) !== null;
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Não autenticado");
  return user;
}

export async function requirePermission(
  code: PermissionCode,
): Promise<SessionUser> {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has(code)) {
    throw new Error("Sem permissão");
  }
  return user;
}

export function needsPasswordChange(user: { mustChangePassword: boolean }) {
  return user.mustChangePassword;
}

export function needs2faSetup(user: { totpEnabled: boolean }) {
  if (is2faDisabled()) return false;
  return !user.totpEnabled;
}

export function needs2faChallenge(user: { totpEnabled: boolean }) {
  if (is2faDisabled()) return false;
  return user.totpEnabled;
}

export async function bumpSessionVersion(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}
