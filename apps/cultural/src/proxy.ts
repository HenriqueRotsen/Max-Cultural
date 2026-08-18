import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  parsePending2faToken,
  parseSessionToken,
} from "@max/auth";

const PUBLIC = new Set([
  "/",
  "/login",
  "/login/2fa",
  "/login/recuperar",
  "/login/redefinir",
  "/logout",
]);

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const proto =
      request.headers.get("x-forwarded-proto") ||
      request.nextUrl.protocol.replace(":", "");
    if (proto === "http") {
      const url = request.nextUrl.clone();
      url.protocol = "https:";
      return NextResponse.redirect(url, 308);
    }
  }

  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/brand") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  let session = null;
  try {
    session = await parseSessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  } catch {
    session = null;
  }
  let pending = null;
  try {
    pending = await parsePending2faToken(
      request.cookies.get(PENDING_2FA_COOKIE)?.value,
    );
  } catch {
    pending = null;
  }

  if (pathname === "/login/2fa") {
    if (session) return NextResponse.redirect(new URL("/", request.url));
    if (!pending) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  if (PUBLIC.has(pathname) || pathname.startsWith("/login/")) {
    return NextResponse.next();
  }

  if (!session) {
    if (pending) {
      return NextResponse.redirect(new URL("/login/2fa", request.url));
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.url);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
