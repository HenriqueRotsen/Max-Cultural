import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  clearAuthCookieOptions,
} from "@max/auth";
import { fluxoHubLogoutUrl } from "@/lib/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Logout via GET — limpa cookie SSO no Domain compartilhado. */
export async function GET() {
  const res = NextResponse.redirect(fluxoHubLogoutUrl());
  for (const opts of clearAuthCookieOptions()) {
    res.cookies.set(AUTH_COOKIE, "", opts);
    res.cookies.set(PENDING_2FA_COOKIE, "", opts);
  }
  return res;
}
