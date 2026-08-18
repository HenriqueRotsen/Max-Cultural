import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  parsePending2faToken,
  parseSessionToken,
} from "@/lib/auth-token";
import {
  AUTH_COOKIE as HUB_COOKIE,
  culturalLoginUrl,
  parseSessionToken as parseHubSession,
} from "@max/auth";

const PUBLIC_DASHBOARD = new Set([
  "/dashboard/login",
  "/dashboard/login/2fa",
  "/dashboard/recuperar",
]);

function isPublicDashboard(pathname: string): boolean {
  if (PUBLIC_DASHBOARD.has(pathname)) return true;
  if (pathname.startsWith("/dashboard/recuperar/")) return true;
  return false;
}

function requiresAuth(pathname: string): boolean {
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/pessoa")) return true;
  if (pathname.startsWith("/territorio")) return true;
  if (pathname.startsWith("/projeto")) return true;
  if (pathname.startsWith("/contexto")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const target = pathname.replace(/^\/admin/, "/dashboard");
    const url = new URL(target, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  if (!requiresAuth(pathname)) {
    return NextResponse.next();
  }

  const session = await parseSessionToken(
    request.cookies.get(AUTH_COOKIE)?.value,
  );
  let hubSession = null;
  if (process.env.NEXT_PUBLIC_CULTURAL_URL && process.env.AUTH_SECRET) {
    try {
      hubSession = await parseHubSession(request.cookies.get(HUB_COOKIE)?.value);
    } catch {
      hubSession = null;
    }
  }
  const pending2fa = await parsePending2faToken(
    request.cookies.get(PENDING_2FA_COOKIE)?.value,
  );
  const hasSession = Boolean(session || hubSession);

  if (pathname.startsWith("/dashboard")) {
    if (pathname === "/dashboard/login/2fa") {
      if (hasSession) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      if (!pending2fa) {
        return NextResponse.redirect(new URL("/dashboard/login", request.url));
      }
      return NextResponse.next();
    }

    if (isPublicDashboard(pathname)) {
      if (hasSession && pathname === "/dashboard/login") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next();
    }
  }

  if (!hasSession) {
    if (pending2fa) {
      return NextResponse.redirect(new URL("/dashboard/login/2fa", request.url));
    }
    if (process.env.AUTH_HUB_REQUIRED === "true") {
      return NextResponse.redirect(culturalLoginUrl(request.url));
    }
    const loginUrl = new URL("/dashboard/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin",
    "/admin/:path*",
    "/pessoa",
    "/pessoa/:path*",
    "/territorio",
    "/territorio/:path*",
    "/projeto/:path*",
    "/contexto/:path*",
  ],
};
