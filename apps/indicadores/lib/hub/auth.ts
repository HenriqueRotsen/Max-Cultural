import type { SessionPayload } from "@max/auth";
import { AUTH_COOKIE, parseSessionToken } from "@max/auth";
import { resolveUserFromHubSession } from "@/lib/auth";
import type { PermissionCode } from "@/lib/permission-catalog";
import { getEffectivePermissions } from "@/lib/permissions";

export function sessionTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("x-max-session")?.trim();
  if (header) return header;
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";").map((p) => p.trim())) {
    if (part.startsWith(`${AUTH_COOKIE}=`)) {
      return part.slice(AUTH_COOKIE.length + 1);
    }
  }
  return null;
}

export async function requireHubSession(
  request: Request,
): Promise<SessionPayload | null> {
  const token = sessionTokenFromRequest(request);
  const session = token ? await parseSessionToken(token) : null;
  if (!session?.email && !session?.userId) {
    return null;
  }
  return session;
}

export type HubAuthResult =
  | { ok: true; session: SessionPayload; userId: string }
  | { ok: false; status: 401 | 403 };

export async function requireHubAnyPermission(
  request: Request,
  codes: PermissionCode[],
): Promise<HubAuthResult> {
  const session = await requireHubSession(request);
  if (!session) {
    return { ok: false, status: 401 };
  }

  const user = await resolveUserFromHubSession(session);
  if (!user) {
    return { ok: false, status: 401 };
  }

  const perms = await getEffectivePermissions(user.id);
  if (!codes.some((code) => perms.has(code))) {
    return { ok: false, status: 403 };
  }

  return { ok: true, session, userId: user.id };
}

export function hubAuthErrorResponse(result: Extract<HubAuthResult, { ok: false }>) {
  const message =
    result.status === 403 ? "Sem permissão" : "Não autenticado";
  return { message, status: result.status };
}
