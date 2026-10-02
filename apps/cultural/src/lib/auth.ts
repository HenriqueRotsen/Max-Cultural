import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { User } from "@/generated/prisma/client";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  MAX_AGE_SECONDS,
  PENDING_2FA_MAX_AGE,
  createPending2faToken,
  createSessionToken,
  firstValidSessionToken,
  parsePending2faToken,
  parseSessionToken,
  sessionCookieOptions,
  cookieDeleteOptions,
  clearAuthCookieOptions,
  ACCESS_BY_ID,
  ACCESS_PERMISSION_IDS,
  grantedIdsFromRoleRows,
  normalizeGrantedIds,
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
  jar.delete({ name: PENDING_2FA_COOKIE, ...cookieDeleteOptions() });
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
  for (const opts of clearAuthCookieOptions()) {
    jar.set(AUTH_COOKIE, "", opts);
    jar.set(PENDING_2FA_COOKIE, "", opts);
  }
}

async function loadSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  const parsed = await parseSessionToken(token);
  if (!parsed) return null;
  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    include: userInclude,
  });
  if (!user || user.deactivatedAt) return null;
  if (user.sessionVersion !== parsed.sessionVersion) return null;
  return user;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const headerToken = await firstValidSessionToken((await headers()).get("cookie"));
  const fromCookie = headerToken || jar.get(AUTH_COOKIE)?.value;
  if (fromCookie) {
    const user = await loadSessionUser(fromCookie);
    if (user) return user;
  }
  // Satélites (Origem/Fluxo) chamam APIs do hub via fetch server-side;
  // o header Cookie é "forbidden" no fetch do Node — usam x-max-session / Bearer.
  // Também cobre cookie presente mas inválido (sessionVersion) + Bearer fresco.
  try {
    const h = await headers();
    const fromHeader =
      h.get("x-max-session") ||
      h.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      null;
    if (!fromHeader || fromHeader === fromCookie) return null;
    return loadSessionUser(fromHeader);
  } catch {
    return null;
  }
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

export function hasPermission(user: SessionUser, permissionId: string) {
  if (user.isSuperAdmin) return true;
  const granted = grantedIdsFromRoleRows(user.role.permissions);
  return granted.has(permissionId);
}

export function can(user: SessionUser, screen: string, action: "view" | "edit") {
  if (user.isSuperAdmin) return true;
  if (action === "view") return hasPermission(user, screen);
  const editCap = `${screen}.edit`;
  if (ACCESS_BY_ID[editCap]) return hasPermission(user, editCap);
  // Legado: canEdit na própria linha da tela / capability.
  const perm = user.role.permissions.find((p) => p.screen === screen);
  return Boolean(perm?.canEdit);
}

/** Hub de projetos: tela dedicada ou qualquer acesso ao Origem. */
export function canViewProjetos(user: SessionUser) {
  return (
    can(user, "cultural.projetos", "view") ||
    can(user, "origem.app", "view") ||
    can(user, "origem.planejamento", "view")
  );
}

export function listGrantedPermissionIds(user: SessionUser): string[] {
  if (user.isSuperAdmin) return [...ACCESS_PERMISSION_IDS];
  return normalizeGrantedIds(grantedIdsFromRoleRows(user.role.permissions));
}
