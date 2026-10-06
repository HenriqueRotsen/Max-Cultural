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
  applyPermissionOverrides,
  grantedIdsFromRoleRows,
  normalizeGrantedIds,
} from "@max/auth";
import { prisma } from "@/lib/db";
import { ensureProtectedSuperAdmin } from "@/lib/ensure-protected-superadmin";
import {
  isProtectedSuperAdminEmail,
  SUPERADMIN_ROLE_NAME,
} from "@/lib/protected-superadmin";
import { is2faDisabled } from "@/lib/totp";

export { AUTH_COOKIE, PENDING_2FA_COOKIE };

const userInclude = {
  role: { include: { permissions: true } },
  permissions: true,
} as const;

export type SessionUser = User & {
  role: {
    id: string;
    name: string;
    permissions: { screen: string; canView: boolean; canEdit: boolean }[];
  };
  permissions: { screen: string; effect: "GRANT" | "DENY" }[];
};

function effectiveGrantedSet(user: SessionUser): Set<string> {
  const fromRole = grantedIdsFromRoleRows(user.role.permissions);
  const withOverrides = applyPermissionOverrides(fromRole, user.permissions);
  return new Set(normalizeGrantedIds(withOverrides));
}

/** Token SSO com os grants do usuário, calculados uma vez no login. */
export async function createSessionTokenForUser(userId: string): Promise<string | null> {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    include: userInclude,
  });
  if (!user) return null;

  // Repara drift: conta raiz sempre Superadmin ativa.
  if (
    isProtectedSuperAdminEmail(user.email) &&
    (!user.isSuperAdmin ||
      user.deactivatedAt ||
      user.role.name !== SUPERADMIN_ROLE_NAME)
  ) {
    await ensureProtectedSuperAdmin();
    user = await prisma.user.findUnique({
      where: { id: userId },
      include: userInclude,
    });
    if (!user) return null;
  }

  if (user.deactivatedAt) return null;
  return createSessionToken({
    userId: user.id,
    sessionVersion: user.sessionVersion,
    email: user.email,
    permissions: listGrantedPermissionIds(user),
  });
}

export async function setSessionCookie(user: { id: string }) {
  const token = await createSessionTokenForUser(user.id);
  if (!token) return;
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, sessionCookieOptions(MAX_AGE_SECONDS));
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

const SESSION_TTL_MS = 45_000;
const sessionUserCache = new Map<string, { user: SessionUser; at: number }>();

function cacheSessionUser(key: string, user: SessionUser) {
  if (sessionUserCache.size > 2000) sessionUserCache.clear();
  sessionUserCache.set(key, { user, at: Date.now() });
}

/** Monta SessionUser a partir do perfil + grants já efetivos no cookie SSO (`u3`). */
function sessionFromCookieGrants(
  user: User & { role: { id: string; name: string } },
  grants: string[],
): SessionUser {
  return {
    ...user,
    role: {
      id: user.role.id,
      name: user.role.name,
      permissions: grants.map((screen) => ({
        screen,
        canView: true,
        // Edit via capability `.edit` no cookie; sem isso, só view (legado no DB).
        canEdit: screen.endsWith(".edit") || grants.includes(`${screen}.edit`),
      })),
    },
    // Overrides já foram aplicados em createSessionTokenForUser.
    permissions: [],
  };
}

async function loadSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  const parsed = await parseSessionToken(token);
  if (!parsed) return null;
  const cacheKey = `${parsed.userId}:${parsed.sessionVersion}`;
  const hit = sessionUserCache.get(cacheKey);
  if (hit && Date.now() - hit.at < SESSION_TTL_MS) return hit.user;

  // Token com grants: valida só sessionVersion/ativo (query leve) e usa o cookie.
  if (parsed.permissions) {
    const slim = await prisma.user.findUnique({
      where: { id: parsed.userId },
      include: { role: { select: { id: true, name: true } } },
    });
    if (!slim || slim.deactivatedAt) return null;
    if (slim.sessionVersion !== parsed.sessionVersion) return null;
    const user = sessionFromCookieGrants(slim, parsed.permissions);
    cacheSessionUser(cacheKey, user);
    return user;
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    include: userInclude,
  });
  if (!user || user.deactivatedAt) return null;
  if (user.sessionVersion !== parsed.sessionVersion) return null;
  cacheSessionUser(cacheKey, user);
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

/**
 * Setup de autenticador (TOTP) não é mais usado — o 2FA é código por e-mail.
 * Mantido por compatibilidade de imports; sempre false.
 */
export function needs2faSetup(_user?: { totpEnabled?: boolean }) {
  return false;
}

/** 2FA obrigatório no login (código por e-mail), salvo AUTH_2FA_DISABLED. */
export function needs2faChallenge(_user?: { totpEnabled?: boolean }) {
  if (is2faDisabled()) return false;
  return true;
}

export function hasPermission(user: SessionUser, permissionId: string) {
  if (user.isSuperAdmin) return true;
  return effectiveGrantedSet(user).has(permissionId);
}

export function can(user: SessionUser, screen: string, action: "view" | "edit") {
  if (user.isSuperAdmin) return true;
  if (action === "view") return hasPermission(user, screen);
  const editCap = `${screen}.edit`;
  if (ACCESS_BY_ID[editCap]) return hasPermission(user, editCap);
  // Legado: canEdit na própria linha da tela / capability, respeitando DENY do usuário.
  if (!hasPermission(user, screen)) return false;
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
  return [...effectiveGrantedSet(user)];
}
