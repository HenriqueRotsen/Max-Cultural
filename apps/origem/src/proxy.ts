import { NextRequest, NextResponse } from "next/server";
import { culturalLoginUrl, firstValidSessionToken } from "@max/auth";
import { isHubSsoEnabled } from "@/lib/auth/hub";

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/precos" ||
    pathname === "/login" ||
    pathname === "/recuperar-senha" ||
    pathname === "/redefinir-senha" ||
    pathname === "/alterar-senha" ||
    pathname === "/auth/callback" ||
    pathname === "/sair"
  );
}

/** Páginas de entrada: se já autenticado, manda para o app. */
function isAuthOnlyPath(pathname: string) {
  return pathname === "/login" || pathname === "/recuperar-senha";
}

/**
 * Gate do Origem: só confere a assinatura do cookie SSO do hub (sem rede).
 * Login, 2FA e permissões vêm do MAX Cultural.
 */
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
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // APIs com autenticação própria (token do hub / CRON_SECRET).
  if (pathname.startsWith("/api/hub") || pathname.startsWith("/api/cron")) {
    return response;
  }

  let hubOk = false;
  if (isHubSsoEnabled()) {
    try {
      hubOk = Boolean(await firstValidSessionToken(request.headers.get("cookie")));
    } catch {
      hubOk = false;
    }
  }

  if (pathname.startsWith("/api/")) {
    return hubOk ? response : NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isPublicPath(pathname) && !hubOk) {
    return NextResponse.redirect(culturalLoginUrl(request.url));
  }

  if (isAuthOnlyPath(pathname) && hubOk) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
