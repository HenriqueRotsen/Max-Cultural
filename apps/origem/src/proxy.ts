import { NextRequest, NextResponse } from "next/server";
import { culturalLoginUrl, firstValidSessionToken } from "@max/auth";
import { isHubSsoEnabled } from "@/lib/auth/hub";
import { updateSession } from "@/lib/supabase/middleware";

function isPublicPath(pathname: string) {
  if (
    pathname === "/" ||
    pathname === "/precos" ||
    pathname === "/login" ||
    pathname === "/recuperar-senha" ||
    pathname === "/redefinir-senha" ||
    pathname === "/alterar-senha" ||
    pathname === "/auth/callback"
  ) {
    return true;
  }
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
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const requestWithPath = new NextRequest(request.url, {
    method: request.method,
    headers: requestHeaders,
  });
  // Preserve cookies on the cloned request.
  request.cookies.getAll().forEach((c) => {
    requestWithPath.cookies.set(c.name, c.value);
  });

  const { response, user } = await updateSession(requestWithPath);

  // APIs do hub: nunca redirecionar para login (retornam 401 JSON).
  if (pathname.startsWith("/api/hub")) {
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

  if (!isPublicPath(pathname) && !user && !hubOk) {
    return NextResponse.redirect(culturalLoginUrl(request.url));
  }

  if (isAuthOnlyPath(pathname) && (user || hubOk)) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
