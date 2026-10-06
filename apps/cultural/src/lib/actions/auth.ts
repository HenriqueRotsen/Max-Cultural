"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  can,
  clearSessionCookie,
  getPending2faUser,
  getSessionUser,
  needs2faChallenge,
  needsPasswordChange,
  setPending2faCookie,
  setSessionCookie,
} from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  generateProvisionalPassword,
  hashPassword,
  validateStrongPassword,
  verifyPassword,
} from "@/lib/password";
import { issueLoginEmailOtp } from "@/lib/email-otp";
import {
  send2faNoticeEmail,
  sendTemporaryPasswordEmail,
} from "@/lib/email";
import { safeContinueUrl } from "@max/auth";
import { verifyRecaptchaToken } from "@/lib/recaptcha";

export type AuthActionState = {
  error?: string;
  ok?: boolean;
  message?: string;
  redirectTo?: string;
};

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function safeNext(raw: string) {
  return safeContinueUrl(raw, "/");
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));
  const ip = await clientIp();

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt) {
    await writeAuditLog({ action: "auth.login_failed", meta: { email }, ip });
    return { error: "E-mail ou senha incorretos." };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_failed",
      ip,
    });
    return { error: "E-mail ou senha incorretos." };
  }

  if (needsPasswordChange(user)) {
    await setSessionCookie(user);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "password_change" },
      ip,
    });
    return { ok: true, redirectTo: "/onboarding/senha" };
  }

  if (needs2faChallenge(user)) {
    const sent = await issueLoginEmailOtp(user);
    if (!sent.ok) {
      return { error: "Não foi possível enviar o código por e-mail. Tente de novo." };
    }
    await setPending2faCookie(user.id);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "2fa_email" },
      ip,
    });
    return { ok: true, redirectTo: `/login/2fa?next=${encodeURIComponent(next)}` };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await setSessionCookie(user);
  await writeAuditLog({ actorUserId: user.id, action: "auth.login_ok", ip });
  return { ok: true, redirectTo: next };
}

export async function logoutAction() {
  // Preferir GET /logout (route) — Server Action + redirect quebrou com digest em prod.
  redirect("/logout");
}

export async function completePasswordChangeAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado." };
  if (!user.mustChangePassword) {
    return { ok: true, redirectTo: "/" };
  }
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { error: "As senhas não coincidem." };
  const strength = validateStrongPassword(password, { email: user.email });
  if (!strength.ok) return { error: strength.error };

  const passwordHash = await hashPassword(password);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      sessionVersion: { increment: 1 },
    },
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.password_changed",
    ip: await clientIp(),
  });

  if (needs2faChallenge(updated)) {
    const sent = await issueLoginEmailOtp(updated);
    if (!sent.ok) {
      return { error: "Senha atualizada, mas o código por e-mail falhou. Faça login novamente." };
    }
    await clearSessionCookie();
    await setPending2faCookie(updated.id);
    return { ok: true, redirectTo: "/login/2fa" };
  }

  await setSessionCookie(updated);
  return { ok: true, redirectTo: "/" };
}

/** Reenvia o código de verificação por e-mail (login 2FA). */
export async function resendLoginEmailOtpAction(): Promise<AuthActionState> {
  const pending = await getPending2faUser();
  if (!pending) return { error: "Sessão expirada. Faça login novamente." };
  const sent = await issueLoginEmailOtp(pending);
  if (!sent.ok) return { error: sent.error };
  await writeAuditLog({
    actorUserId: pending.id,
    action: "auth.2fa_email_sent",
    ip: await clientIp(),
  });
  return { ok: true, message: "Novo código enviado para o seu e-mail." };
}

export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const captcha = await verifyRecaptchaToken(
    String(formData.get("recaptchaToken") ?? ""),
    "password_reset",
    await clientIp(),
  );
  if (!captcha.ok) return { error: captcha.error };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const generic = {
    ok: true as const,
    message: "Se o e-mail existir, enviaremos uma senha temporária.",
  };
  if (!email) return { error: "Informe o e-mail." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt) return generic;

  const provisional = generateProvisionalPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(provisional),
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    },
  });

  const sent = await sendTemporaryPasswordEmail({
    to: user.email,
    name: user.name,
    link: `${siteUrl()}/login`,
    provisionalPassword: provisional,
  });
  if (!sent.ok) {
    console.error("[password-reset] e-mail falhou:", sent.error);
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.password_reset_requested",
    ip: await clientIp(),
  });

  return generic;
}

/** Encerra sessões do usuário (admin). 2FA continua sendo código por e-mail no próximo login. */
export async function adminReset2faAction(userId: string) {
  const actor = await getSessionUser();
  if (!actor || !(actor.isSuperAdmin || can(actor, "cultural.usuarios", "edit"))) {
    redirect("/usuarios?error=" + encodeURIComponent("Sem permissão."));
  }
  if (userId === actor.id) {
    redirect(
      "/usuarios?error=" +
        encodeURIComponent("Para encerrar a própria sessão, use Sair."),
    );
  }
  const target = await prisma.user.update({
    where: { id: userId },
    data: {
      totpEnabled: false,
      totpSecretEnc: null,
      sessionVersion: { increment: 1 },
    },
  });
  await prisma.emailOtp.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.sessions_revoked",
    screen: "cultural.usuarios",
    entityType: "user",
    entityId: userId,
    ip: await clientIp(),
  });
  await send2faNoticeEmail({ to: target.email, name: target.name });
  revalidatePath("/usuarios");
  redirect("/usuarios?reset2fa=1");
}
