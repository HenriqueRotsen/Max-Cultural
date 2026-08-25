import { AUTH_COOKIE, parseSessionToken } from "@max/auth";

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

export async function requireHubSession(request: Request) {
  const token = sessionTokenFromRequest(request);
  const session = token ? await parseSessionToken(token) : null;
  if (!session?.email && !session?.userId) {
    return null;
  }
  return session;
}
