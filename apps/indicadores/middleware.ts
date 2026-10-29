import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  culturalLoginUrl,
  firstValidSessionToken,
  parseSessionToken as parseHubSession,
} from "@max/auth";
import { AUTH_COOKIE as LOCAL_COOKIE, parseSessionToken } from "@/lib/auth-token";

function requiresAuth(pathname: string): boolean {
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/pessoa")) return true;
  if (pathname.startsWith("/territorio")) return true;
  if (pathname.startsWith("/projeto")) return true;
  if (pathname.startsWith("/contexto")) return true;
  return false;
}

function isLegacyAuthPath(pathname: string): boolean {
  if (pathname === "/dashboard/login" || pathname.startsWith("/dashboard/login/")) return true;
  if (pathname === "/dashboard/recuperar" || pathname.startsWith("/dashboard/recuperar/")) {
    return true;
  }
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
    request.cookies.get(LOCAL_COOKIE)?.value,
  );
  let hubSession = null;
  try {
    const token = await firstValidSessionToken(request.headers.get("cookie"));
    hubSession = token ? await parseHubSession(token) : null;
  } catch {
    hubSession = null;
  }
  const hasSession = Boolean(session || hubSession);

  if (isLegacyAuthPath(pathname)) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    const next = new URL("/dashboard", request.url).toString();
    return NextResponse.redirect(culturalLoginUrl(next));
  }

  if (!hasSession) {
    return NextResponse.redirect(culturalLoginUrl(request.url));
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
