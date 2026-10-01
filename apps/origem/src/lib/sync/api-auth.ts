import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { AUTH_COOKIE, parseSessionToken } from "@max/auth";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Autentica rotas de sync: sessão Origem/hub OU header interno SYNC_INTERNAL_SECRET.
 */
export async function assertSyncApiAuth(request: Request): Promise<NextResponse | null> {
  const secret = (process.env.SYNC_INTERNAL_SECRET || "").trim();
  const provided =
    request.headers.get("x-sync-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret && provided && provided === secret) {
    return null;
  }

  const session = await getSessionUser();
  if (session) return null;

  const jar = await headers();
  const cookieHeader = jar.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
  if (match?.[1] && (await parseSessionToken(decodeURIComponent(match[1])))) {
    return null;
  }

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
