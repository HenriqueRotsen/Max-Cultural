import { NextResponse, type NextRequest } from "next/server";
import {
  PENDING_2FA_COOKIE,
  PENDING_2FA_MAX_AGE,
  createPending2faToken,
  safeContinueUrl,
  sessionCookieOptions,
  writeSessionCookie,
} from "@max/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  createSessionTokenForUser,
  needs2faChallenge,
  needsPasswordChange,
} from "@/lib/auth";
import { issueLoginEmailOtp } from "@/lib/email-otp";
import { verifyRecaptchaToken } from "@/lib/recaptcha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function loginErrorRedirect(request: NextRequest, next: string, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

/** 200 + Set-Cookie + navegação no cliente: o browser grava o cookie antes de sair da página. */
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

/**
 * Login via POST clássico (não Server Action): o cookie SSO, já com os grants
 * do usuário, é gravado na resposta da navegação.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeContinueUrl(String(form.get("next") ?? "/"), "/");
  const ip = clientIp(request);

  const captcha = await verifyRecaptchaToken(
    String(form.get("recaptchaToken") ?? ""),
    "login",
    ip,
  );
  if (!captcha.ok) {
    return loginErrorRedirect(request, next, captcha.error);
  }

  if (!email || !password) {
    return loginErrorRedirect(request, next, "Informe e-mail e senha.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt) {
    void writeAuditLog({ action: "auth.login_failed", meta: { email }, ip }).catch(() => {});
    return loginErrorRedirect(request, next, "E-mail ou senha incorretos.");
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    void writeAuditLog({ actorUserId: user.id, action: "auth.login_failed", ip }).catch(() => {});
    return loginErrorRedirect(request, next, "E-mail ou senha incorretos.");
  }

  // Senha temporária: libera sessão parcial só para trocar a senha.
  if (needsPasswordChange(user)) {
    const token = await createSessionTokenForUser(user.id);
    if (!token) {
      return loginErrorRedirect(
        request,
        next,
        "Não foi possível criar a sessão. Contate o suporte.",
      );
    }
    void writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "password_change" },
      ip,
    }).catch(() => {});
    return htmlRedirect("/onboarding/senha", token);
  }

  // 2FA obrigatório: código por e-mail cadastrado.
  if (needs2faChallenge(user)) {
    const sent = await issueLoginEmailOtp(user);
    if (!sent.ok) {
      return loginErrorRedirect(
        request,
        next,
        "Não foi possível enviar o código por e-mail. Tente de novo em instantes.",
      );
    }
    const res = NextResponse.redirect(
      new URL(`/login/2fa?next=${encodeURIComponent(next)}`, request.url),
      303,
    );
    res.cookies.set(
      PENDING_2FA_COOKIE,
      await createPending2faToken(user.id),
      sessionCookieOptions(PENDING_2FA_MAX_AGE),
    );
    void writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "2fa_email" },
      ip,
    }).catch(() => {});
    return res;
  }

  const token = await createSessionTokenForUser(user.id);
  if (!token) {
    return loginErrorRedirect(
      request,
      next,
      "Não foi possível criar a sessão. Contate o suporte.",
    );
  }

  await Promise.all([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    writeAuditLog({ actorUserId: user.id, action: "auth.login_ok", ip }).catch(() => {}),
  ]);
  return htmlRedirect(next, token);
}
