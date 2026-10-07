import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  clearAuthCookieOptions,
  isPrefetchRequest,
  safeContinueUrl,
} from "@max/auth";

export const dynamic = "force-dynamic";

/**
 * Limpa só `max_session` (cookie fantasma após sessionVersion++).
 * Não mexe em `max_pending_2fa` — o fluxo de código por e-mail continua válido.
 */
export async function GET(request: NextRequest) {
  if (isPrefetchRequest(request)) {
    return new NextResponse(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  }

  const rawNext = request.nextUrl.searchParams.get("next") || "/login";
  const next = safeContinueUrl(rawNext, "/login");
  const dest =
    next.startsWith("http://") || next.startsWith("https://")
      ? next
      : new URL(next.startsWith("/") ? next : "/login", request.url).toString();

  const res = NextResponse.redirect(dest);
  res.headers.set("cache-control", "no-store");
  for (const opts of clearAuthCookieOptions()) {
    res.cookies.set(AUTH_COOKIE, "", opts);
  }
  return res;
}
