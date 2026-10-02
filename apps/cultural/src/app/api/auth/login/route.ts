import { NextResponse, type NextRequest } from "next/server";
import {
  PENDING_2FA_COOKIE,
  PENDING_2FA_MAX_AGE,
  createPending2faToken,
  createSessionToken,
  safeContinueUrl,
  sessionCookieOptions,
  writeSessionCookie,
} from "@max/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  needs2faChallenge,
  needs2faSetup,
  needsPasswordChange,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function redirectTo(request: NextRequest, target: string) {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return NextResponse.redirect(target, 303);
  }
  return NextResponse.redirect(new URL(target, request.url), 303);
}

function loginErrorRedirect(request: NextRequest, next: string, error: string) {
  const url = new URL("/login", request.url);
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
  return res;
}

function attachPending2fa(res: NextResponse, token: string) {
  res.cookies.set(
    PENDING_2FA_COOKIE,
    token,
    sessionCookieOptions(PENDING_2FA_MAX_AGE),
  );
}

/**
 * Login via POST clássico (não Server Action): o browser grava Set-Cookie
 * na resposta de navegação top-level — necessário para o SSO cross-subdomain.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeContinueUrl(String(form.get("next") ?? "/"), "/");
  const ip = clientIp(request);

  if (!email || !password) {
    return loginErrorRedirect(request, next, "Informe e-mail e senha.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt) {
    await writeAuditLog({ action: "auth.login_failed", meta: { email }, ip });
    return loginErrorRedirect(request, next, "E-mail ou senha incorretos.");
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_failed",
      ip,
    });
    return loginErrorRedirect(request, next, "E-mail ou senha incorretos.");
  }

  if (needsPasswordChange(user)) {
    const token = await createSessionToken({
      userId: user.id,
      sessionVersion: user.sessionVersion,
      email: user.email,
    });
    const res = htmlRedirect("/onboarding/senha", token);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "password_change" },
      ip,
    });
    return res;
  }

  if (needs2faChallenge(user)) {
    const pending = await createPending2faToken(user.id);
    const res = redirectTo(
      request,
      `/login/2fa?next=${encodeURIComponent(next)}`,
    );
    attachPending2fa(res, pending);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "2fa_challenge" },
      ip,
    });
    return res;
  }

  if (needs2faSetup(user)) {
    const token = await createSessionToken({
      userId: user.id,
      sessionVersion: user.sessionVersion,
      email: user.email,
    });
    const res = htmlRedirect("/onboarding/2fa", token);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "2fa_setup" },
      ip,
    });
    return res;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const token = await createSessionToken({
    userId: user.id,
    sessionVersion: user.sessionVersion,
    email: user.email,
  });
  const res = htmlRedirect(next, token);
  await writeAuditLog({ actorUserId: user.id, action: "auth.login_ok", ip });
  return res;
}
