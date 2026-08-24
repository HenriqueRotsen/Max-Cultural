"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  getPending2faUser,
  getSessionUser,
  needs2faChallenge,
  needs2faSetup,
  needsPasswordChange,
  setPending2faCookie,
  setSessionCookie,
} from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  hashToken,
  randomToken,
  validateStrongPassword,
  verifyPassword,
} from "@/lib/password";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  is2faDisabled,
  totpQrDataUrl,
  verifyTotpCode,
} from "@/lib/totp";
import { send2faNoticeEmail, sendPasswordResetEmail } from "@/lib/email";
import { safeContinueUrl } from "@max/auth";

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
    await setPending2faCookie(user.id);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "2fa_challenge" },
      ip,
    });
    return { ok: true, redirectTo: `/login/2fa?next=${encodeURIComponent(next)}` };
  }

  if (needs2faSetup(user)) {
    await setSessionCookie(user);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "2fa_setup" },
      ip,
    });
    return { ok: true, redirectTo: "/onboarding/2fa" };
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
  const user = await getSessionUser();
  await clearSessionCookie();
  if (user) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.logout",
      ip: await clientIp(),
    });
  }
  redirect("/login");
}

export async function completePasswordChangeAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado." };
  if (!user.mustChangePassword) {
    return { ok: true, redirectTo: needs2faSetup(user) ? "/onboarding/2fa" : "/" };
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
  await setSessionCookie({ ...updated, email: user.email });
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.password_changed",
    ip: await clientIp(),
  });
  return { ok: true, redirectTo: needs2faSetup(updated) ? "/onboarding/2fa" : "/" };
}

export async function startTotpSetupAction(): Promise<
  | { ok: true; secret: string; qrDataUrl: string }
  | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado." };
  if (is2faDisabled()) return { ok: false, error: "2FA desativado neste ambiente." };
  const secret = generateTotpSecret();
  const enc = await encryptTotpSecret(secret);
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEnc: enc, totpEnabled: false },
  });
  const qrDataUrl = await totpQrDataUrl(secret, user.email);
  return { ok: true, secret, qrDataUrl };
}

export async function confirmTotpSetupAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado." };
  if (is2faDisabled()) return { ok: true, redirectTo: "/" };
  const code = String(formData.get("code") ?? "");
  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fresh?.totpSecretEnc) {
    return { error: "Inicie a configuração do autenticador primeiro." };
  }
  const secret = await decryptTotpSecret(fresh.totpSecretEnc);
  if (!verifyTotpCode(secret, code)) {
    return { error: "Código inválido. Tente novamente." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, lastLoginAt: fresh.lastLoginAt ?? new Date() },
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.2fa_enabled",
    ip: await clientIp(),
  });
  return { ok: true, redirectTo: "/" };
}

export async function verifyTotpLoginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const pending = await getPending2faUser();
  if (!pending) return { error: "Sessão expirada. Faça login novamente." };
  const code = String(formData.get("code") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));
  if (!pending.totpSecretEnc || !pending.totpEnabled) {
    return { error: "2FA não configurado." };
  }
  const secret = await decryptTotpSecret(pending.totpSecretEnc);
  if (!verifyTotpCode(secret, code)) {
    await writeAuditLog({
      actorUserId: pending.id,
      action: "auth.2fa_failed",
      ip: await clientIp(),
    });
    return { error: "Código inválido." };
  }
  await prisma.user.update({
    where: { id: pending.id },
    data: { lastLoginAt: new Date() },
  });
  await setSessionCookie(pending);
  await writeAuditLog({
    actorUserId: pending.id,
    action: "auth.login_ok",
    meta: { method: "totp" },
    ip: await clientIp(),
  });
  return { ok: true, redirectTo: next };
}

export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Informe o e-mail." };
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.deactivatedAt) {
    const raw = randomToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: await hashToken(raw),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      link: `${siteUrl()}/login/redefinir?token=${raw}`,
    });
  }
  return { ok: true, message: "Se o e-mail existir, enviaremos o link." };
}

export async function adminReset2faAction(userId: string) {
  const actor = await getSessionUser();
  if (
    !actor ||
    (!actor.isSuperAdmin &&
      !actor.role.permissions.some((p) => p.screen === "cultural.usuarios" && p.canEdit))
  ) {
    redirect("/usuarios?error=" + encodeURIComponent("Sem permissão."));
  }
  const target = await prisma.user.update({
    where: { id: userId },
    data: {
      totpEnabled: false,
      totpSecretEnc: null,
      sessionVersion: { increment: 1 },
    },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.2fa_reset",
    screen: "cultural.usuarios",
    entityType: "user",
    entityId: userId,
    ip: await clientIp(),
  });
  await send2faNoticeEmail({ to: target.email, name: target.name });
  revalidatePath("/usuarios");
}
