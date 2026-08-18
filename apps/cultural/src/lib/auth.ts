import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@/generated/prisma/client";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  MAX_AGE_SECONDS,
  PENDING_2FA_MAX_AGE,
  createPending2faToken,
  createSessionToken,
  parsePending2faToken,
  parseSessionToken,
  sessionCookieOptions,
  cookieDeleteOptions,
} from "@max/auth";
import { prisma } from "@/lib/db";
import { is2faDisabled } from "@/lib/totp";

export { AUTH_COOKIE, PENDING_2FA_COOKIE };

const userInclude = {
  role: { include: { permissions: true } },
} as const;

export type SessionUser = User & {
  role: { id: string; name: string; permissions: { screen: string; canView: boolean; canEdit: boolean }[] };
};

export async function setSessionCookie(user: {
  id: string;
  sessionVersion: number;
  email: string;
}) {
  const jar = await cookies();
  jar.set(
    AUTH_COOKIE,
    await createSessionToken({
      userId: user.id,
      sessionVersion: user.sessionVersion,
      email: user.email,
    }),
    sessionCookieOptions(MAX_AGE_SECONDS),
  );
  jar.delete(PENDING_2FA_COOKIE);
}

export async function setPending2faCookie(userId: string) {
  const jar = await cookies();
  jar.set(
    PENDING_2FA_COOKIE,
    await createPending2faToken(userId),
    sessionCookieOptions(PENDING_2FA_MAX_AGE),
  );
}

export async function clearSessionCookie() {
  const jar = await cookies();
  const opts = cookieDeleteOptions();
  jar.delete({ name: AUTH_COOKIE, ...opts });
  jar.delete({ name: PENDING_2FA_COOKIE, ...opts });
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const parsed = await parseSessionToken(jar.get(AUTH_COOKIE)?.value);
  if (!parsed) return null;
  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    include: userInclude,
  });
  if (!user || user.deactivatedAt) return null;
  if (user.sessionVersion !== parsed.sessionVersion) return null;
  return user;
});

export async function getPending2faUser(): Promise<User | null> {
  const jar = await cookies();
  const parsed = await parsePending2faToken(jar.get(PENDING_2FA_COOKIE)?.value);
  if (!parsed) return null;
  const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
  if (!user || user.deactivatedAt) return null;
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

export function can(user: SessionUser, screen: string, action: "view" | "edit") {
  if (user.isSuperAdmin) return true;
  const perm = user.role.permissions.find((p) => p.screen === screen);
  if (!perm) return false;
  return action === "edit" ? perm.canEdit : perm.canView;
}
