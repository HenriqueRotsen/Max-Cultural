import { cache } from "react";
import { cookies, headers } from "next/headers";
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
  firstValidSessionToken,
  parseSessionToken as parseHubSession,
} from "@max/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, randomToken } from "@/lib/password";
import {
  ADMIN_ROLE_NAME,
  OPERATOR_ROLE_NAME,
  PROFESSOR_ROLE_NAME,
  type PermissionCode,
} from "@/lib/permission-catalog";
import {
  getEffectivePermissions,
  type AuthUser,
} from "@/lib/permissions";

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

  // Login único no MAX Cultural: o cookie SSO do hub manda.
  const hubUrl = (process.env.NEXT_PUBLIC_CULTURAL_URL || "").trim();
  if (hubUrl && process.env.AUTH_SECRET) {
    let hub = null;
    try {
      const headerToken = await firstValidSessionToken((await headers()).get("cookie"));
      hub = await parseHubSession(headerToken || jar.get(HUB_COOKIE)?.value);
    } catch {
      hub = null;
    }
    if (hub?.email) {
      return resolveUserFromHubSession({
        email: hub.email,
        permissions: hub.permissions,
      });
    }
  }

  const parsed = await parseSessionToken(jar.get(AUTH_COOKIE)?.value);
  if (!parsed) return null;
  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    include: userInclude,
  });
  if (user && !user.deactivatedAt && user.sessionVersion === parsed.sessionVersion) {
    return user;
  }
  return null;
});

/** Resolve (ou provisiona) usuário Fluxo a partir da sessão compartilhada do hub. */
export async function resolveUserFromHubSession(session: {
  email?: string;
  permissions?: string[];
}): Promise<SessionUser | null> {
  const email = session.email?.trim().toLowerCase();
  if (!email) return null;
  return ensureUserFromHub({
    email,
    name: email.split("@")[0] || "MAX Cultural",
    hubPermissions: session.permissions,
  });
}

const HUB_USER_TTL_MS = 45_000;
const hubUserCache = new Map<string, { user: SessionUser; at: number }>();

function hubLooksLikeProfessorOnly(permissions: string[] | undefined): boolean {
  if (!permissions?.length) return false;
  const set = new Set(permissions);
  if (!set.has("fluxo.app")) return false;
  // Operação ou consultas = não é professor restrito.
  if (set.has("fluxo.operacao") || set.has("fluxo.consultas")) return false;
  // Cookie completo (fluxo.formularios) ou cookie antigo só com fluxo.app.
  return true;
}

async function ensureUserFromHub(input: {
  email: string;
  name: string;
  hubPermissions?: string[];
}): Promise<SessionUser | null> {
  const cached = hubUserCache.get(input.email);
  if (
    cached &&
    Date.now() - cached.at < HUB_USER_TTL_MS &&
    !cached.user.deactivatedAt &&
    !cached.user.mustChangePassword
  ) {
    return cached.user;
  }

  const professorOnly = hubLooksLikeProfessorOnly(input.hubPermissions);
  const preferredRoleName = professorOnly
    ? PROFESSOR_ROLE_NAME
    : OPERATOR_ROLE_NAME;

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    include: userInclude,
  });
  if (existing) {
    if (existing.deactivatedAt) return null;

    const preferredRole = await prisma.role.findUnique({
      where: { name: preferredRoleName },
    });
    const shouldAlignRole =
      preferredRole &&
      !existing.isSuperAdmin &&
      existing.role.name !== preferredRoleName &&
      (existing.role.name === OPERATOR_ROLE_NAME ||
        existing.role.name === PROFESSOR_ROLE_NAME);

    const user =
      existing.mustChangePassword || shouldAlignRole
        ? await prisma.user.update({
            where: { id: existing.id },
            data: {
              ...(existing.mustChangePassword
                ? { mustChangePassword: false, lastLoginAt: new Date() }
                : {}),
              ...(shouldAlignRole && preferredRole
                ? { roleId: preferredRole.id }
                : {}),
            },
            include: userInclude,
          })
        : existing;
    if (hubUserCache.size > 2000) hubUserCache.clear();
    hubUserCache.set(input.email, { user, at: Date.now() });
    return user;
  }

  const preferredRole = await prisma.role.findUnique({
    where: { name: preferredRoleName },
  });
  const role =
    preferredRole ||
    (await prisma.role.findUnique({ where: { name: OPERATOR_ROLE_NAME } })) ||
    (await prisma.role.findUnique({ where: { name: ADMIN_ROLE_NAME } }));
  if (!role) return null;

  const created = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(randomToken()),
      roleId: role.id,
      isSuperAdmin: false,
      mustChangePassword: false,
      totpEnabled: false,
      lastLoginAt: new Date(),
    },
    include: userInclude,
  });
  if (hubUserCache.size > 2000) hubUserCache.clear();
  hubUserCache.set(input.email, { user: created, at: Date.now() });
  return created;
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

/** Auth local removido — senha/2FA só no MAX Cultural. */
export function needsPasswordChange(_user?: { mustChangePassword?: boolean }) {
  return false;
}

export function needs2faSetup(_user?: { totpEnabled?: boolean }) {
  return false;
}

export function needs2faChallenge(_user?: { totpEnabled?: boolean }) {
  return false;
}

export async function bumpSessionVersion(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}
