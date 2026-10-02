import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  clearAuthCookieOptions,
  isPrefetchRequest,
} from "@max/auth";
import { origemHubLogoutUrl } from "@/lib/auth/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Logout do Origem: limpa o cookie SSO e manda ao /logout do Cultural. */
export async function GET(request: NextRequest) {
  if (isPrefetchRequest(request)) {
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  const res = NextResponse.redirect(origemHubLogoutUrl());
  res.headers.set("cache-control", "no-store");
  for (const opts of clearAuthCookieOptions()) {
    res.cookies.set(AUTH_COOKIE, "", opts);
    res.cookies.set(PENDING_2FA_COOKIE, "", opts);
  }
  return res;
}
