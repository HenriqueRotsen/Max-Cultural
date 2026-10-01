import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, PENDING_2FA_COOKIE, cookieDeleteOptions } from "@max/auth";
import { clearSessionCookie } from "@/lib/auth";
import { fluxoHubLogoutUrl } from "@/lib/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Logout via GET — evita Server Action + redirect cross-origin. */
export async function GET() {
  try {
    await clearSessionCookie();
  } catch {
    // ignore
  }
  try {
    const jar = await cookies();
    const opts = cookieDeleteOptions();
    jar.delete({ name: AUTH_COOKIE, ...opts });
    jar.delete({ name: PENDING_2FA_COOKIE, ...opts });
  } catch {
    // ignore
  }
  return NextResponse.redirect(fluxoHubLogoutUrl());
}
