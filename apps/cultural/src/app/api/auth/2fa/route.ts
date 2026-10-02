import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  MAX_AGE_SECONDS,
  clearAuthCookieOptions,
  createSessionToken,
  parsePending2faToken,
  safeContinueUrl,
  sessionCookieOptions,
} from "@max/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";

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

function twoFaErrorRedirect(request: NextRequest, next: string, error: string) {
  const url = new URL("/login/2fa", request.url);
  url.searchParams.set("error", error);
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

/**
 * Verificação 2FA via POST clássico — grava max_session no Set-Cookie da navegação.
 */
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
  if (!user.totpSecretEnc || !user.totpEnabled) {
    return twoFaErrorRedirect(request, next, "2FA não configurado.");
  }

  const secret = await decryptTotpSecret(user.totpSecretEnc);
  if (!verifyTotpCode(secret, code)) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.2fa_failed",
      ip,
    });
    return twoFaErrorRedirect(request, next, "Código inválido.");
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
  const res = redirectTo(request, next);
  res.cookies.set(AUTH_COOKIE, token, sessionCookieOptions(MAX_AGE_SECONDS));
  for (const opts of clearAuthCookieOptions()) {
    res.cookies.set(PENDING_2FA_COOKIE, "", opts);
  }
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.login_ok",
    meta: { method: "totp" },
    ip,
  });
  return res;
}
