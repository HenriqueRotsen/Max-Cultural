import { NextResponse, type NextRequest } from "next/server";
import {
  PENDING_2FA_COOKIE,
  parsePending2faToken,
  safeContinueUrl,
  writeSessionCookie,
} from "@max/auth";
import { writeAuditLog } from "@/lib/audit";
import { createSessionTokenForUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyLoginEmailOtp } from "@/lib/email-otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function twoFaErrorRedirect(request: NextRequest, next: string, error: string) {
  const url = new URL("/login/2fa", request.url);
  url.searchParams.set("error", error);
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

function htmlRedirect(dest: string, token: string) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Entrando…</title><meta http-equiv="refresh" content="0;url=${dest.replace(/"/g, "")}"></head><body><script>location.replace(${JSON.stringify(dest)})</script></body></html>`;
  const res = new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
  writeSessionCookie(res, token);
  res.cookies.set(PENDING_2FA_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/** Verificação 2FA por e-mail via POST clássico — grava max_session antes do redirect. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const code = String(form.get("code") ?? "");
  const next = safeContinueUrl(String(form.get("next") ?? "/"), "/");
  const ip = clientIp(request);

  const pendingRaw = request.cookies.get(PENDING_2FA_COOKIE)?.value;
  const pending = await parsePending2faToken(pendingRaw);
  if (!pending) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user || user.deactivatedAt) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  if (!(await verifyLoginEmailOtp(user.id, code))) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.2fa_failed",
      meta: { method: "email" },
      ip,
    });
    return twoFaErrorRedirect(request, next, "Código inválido ou expirado.");
  }

  const [token] = await Promise.all([
    createSessionTokenForUser(user.id),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_ok",
      meta: { method: "email_otp" },
      ip,
    }).catch(() => {}),
  ]);
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }
  return htmlRedirect(next, token);
}
