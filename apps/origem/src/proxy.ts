import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, culturalLoginUrl, parseSessionToken } from "@max/auth";
import { needsLogin } from "@/lib/auth/config";
import { isHubSsoEnabled } from "@/lib/auth/hub";
import { updateSession } from "@/lib/supabase/middleware";

function isPublicPath(pathname: string) {
  if (
    pathname === "/" ||
    pathname === "/precos" ||
    pathname === "/contato" ||
    pathname === "/login" ||
    pathname === "/recuperar-senha" ||
    pathname === "/redefinir-senha" ||
    pathname === "/alterar-senha" ||
    pathname === "/auth/callback"
  ) {
    return true;
  }
  if (pathname.startsWith("/api/cron")) return true;
  return false;
}

/** Páginas de entrada: se já autenticado, manda para o app (exceto fluxo de reset). */
function isAuthOnlyPath(pathname: string) {
  return pathname === "/login" || pathname === "/recuperar-senha";
}

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
  const { response, user } = await updateSession(request);

  if (!needsLogin()) {
    return response;
  }

  let hubOk = false;
  if (isHubSsoEnabled()) {
    try {
      hubOk = Boolean(
        await parseSessionToken(request.cookies.get(AUTH_COOKIE)?.value),
      );
    } catch {
      hubOk = false;
    }
  }

  if (!isPublicPath(pathname) && !user && !hubOk) {
    if (isHubSsoEnabled()) {
      return NextResponse.redirect(culturalLoginUrl(request.url));
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (isAuthOnlyPath(pathname) && (user || hubOk)) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
