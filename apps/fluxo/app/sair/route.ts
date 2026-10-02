import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  clearAuthCookieOptions,
  isPrefetchRequest,
} from "@max/auth";
import { fluxoHubLogoutUrl } from "@/lib/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Logout via GET — limpa cookie SSO no Domain compartilhado. */
export async function GET(request: NextRequest) {
  if (isPrefetchRequest(request)) {
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  const res = NextResponse.redirect(fluxoHubLogoutUrl());
  res.headers.set("cache-control", "no-store");
  for (const opts of clearAuthCookieOptions()) {
    res.cookies.set(AUTH_COOKIE, "", opts);
    res.cookies.set(PENDING_2FA_COOKIE, "", opts);
  }
  return res;
}
