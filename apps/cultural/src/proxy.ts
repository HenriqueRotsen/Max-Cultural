import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  parsePending2faToken,
  parseSessionToken,
  firstValidSessionToken,
  safeContinueUrl,
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
    const token = await firstValidSessionToken(request.headers.get("cookie"));
    session = await parseSessionToken(token);
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

  if (pathname === "/login" && session) {
    const next = safeContinueUrl(request.nextUrl.searchParams.get("next"), "/");
    if (next.startsWith("http://") || next.startsWith("https://")) {
      const grants = new Set(session.permissions ?? []);
      const origemBase = (process.env.NEXT_PUBLIC_ORIGEM_URL || "").replace(/\/$/, "");
      const fluxoBase = (process.env.NEXT_PUBLIC_FLUXO_URL || "").replace(/\/$/, "");
      // Já logado sem produto: não devolve ao satélite (evita ERR_TOO_MANY_REDIRECTS).
      if (origemBase && next.startsWith(origemBase) && !grants.has("origem.app")) {
        const home = new URL("/", request.url);
        home.searchParams.set("error", "Sem acesso ao MAX Origem.");
        return NextResponse.redirect(home);
      }
      if (fluxoBase && next.startsWith(fluxoBase) && !grants.has("fluxo.app")) {
        const home = new URL("/", request.url);
        home.searchParams.set("error", "Sem acesso ao MAX Fluxo.");
        return NextResponse.redirect(home);
      }
      return NextResponse.redirect(next);
    }
    return NextResponse.redirect(new URL(next, request.url));
  }

  if (pathname === "/login/2fa") {
    if (session) return NextResponse.redirect(new URL("/", request.url));
    if (!pending) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  if (PUBLIC.has(pathname) || pathname.startsWith("/login/")) {
    return NextResponse.next();
  }

  // APIs respondem 401 JSON; nunca redirecionar para /login (quebra SSO satélites).
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!session) {
    if (pending) {
      return NextResponse.redirect(new URL("/login/2fa", request.url));
    }
    const login = new URL("/login", request.url);
    const next = `${pathname}${request.nextUrl.search}`;
    if (next && next !== "/") login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
