"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearPending2faCookie,
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
import { prisma } from "@/lib/prisma";
import {
  generateProvisionalPassword,
  hashPassword,
  hashToken,
  randomOtpCode,
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
import {
  sendLoginOtpEmail,
  sendPasswordResetEmail,
  sendProvisionalPasswordEmail,
} from "@/lib/email";

export type AuthActionState = {
  error?: string;
  ok?: boolean;
  message?: string;
};

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/dashboard");
  const next = nextRaw.startsWith("/dashboard") ? nextRaw : "/dashboard";
  const ip = await clientIp();

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt) {
    await writeAuditLog({
      action: "auth.login_failed",
      meta: { email, reason: "not_found_or_inactive" },
      ip,
    });
    return { error: "E-mail ou senha incorretos." };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_failed",
      meta: { reason: "bad_password" },
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
    redirect("/dashboard/onboarding/senha");
  }

  if (needs2faChallenge(user)) {
    await setPending2faCookie(user.id);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "2fa_challenge" },
      ip,
    });
    redirect("/dashboard/login/2fa");
  }

  if (needs2faSetup(user)) {
    await setSessionCookie(user);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_partial",
      meta: { step: "2fa_setup" },
      ip,
    });
    redirect("/dashboard/onboarding/2fa");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await setSessionCookie(user);
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.login_ok",
    ip,
  });
  redirect(next);
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
  redirect("/dashboard/login");
}

export async function completePasswordChangeAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado." };
  if (!user.mustChangePassword) {
    redirect(needs2faSetup(user) ? "/dashboard/onboarding/2fa" : "/dashboard");
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
  await setSessionCookie(updated);
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.password_changed",
    meta: { reason: "onboarding" },
    ip: await clientIp(),
  });

  if (needs2faSetup(updated)) {
    redirect("/dashboard/onboarding/2fa");
  }

  // Com 2FA desativado (ou já configurado), o onboarding encerra aqui:
  // precisa registrar o login, senão a UI fica em "nunca logou".
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.login_ok",
    meta: { method: "password_onboarding" },
    ip: await clientIp(),
  });
  redirect("/dashboard");
}

export async function startTotpSetupAction(): Promise<
  | { ok: true; secret: string; qrDataUrl: string }
  | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado." };
  if (is2faDisabled()) {
    return { ok: false, error: "2FA desativado neste ambiente." };
  }

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
  if (is2faDisabled()) {
    redirect("/dashboard");
  }

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
    data: {
      totpEnabled: true,
      lastLoginAt: fresh.lastLoginAt ?? new Date(),
    },
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.2fa_enabled",
    ip: await clientIp(),
  });
  redirect("/dashboard");
}

export async function verifyTotpLoginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const pending = await getPending2faUser();
  if (!pending) return { error: "Sessão expirada. Faça login novamente." };

  const code = String(formData.get("code") ?? "");
  if (!pending.totpSecretEnc || !pending.totpEnabled) {
    return { error: "2FA não configurado." };
  }
  const secret = await decryptTotpSecret(pending.totpSecretEnc);
  if (!verifyTotpCode(secret, code)) {
    await writeAuditLog({
      actorUserId: pending.id,
      action: "auth.2fa_failed",
      meta: { method: "totp" },
      ip: await clientIp(),
    });
    return { error: "Código inválido." };
  }

  await prisma.user.update({
    where: { id: pending.id },
    data: { lastLoginAt: new Date() },
  });
  await setSessionCookie(pending);
  await clearPending2faCookie();
  await writeAuditLog({
    actorUserId: pending.id,
    action: "auth.login_ok",
    meta: { method: "totp" },
    ip: await clientIp(),
  });
  redirect("/dashboard");
}

export async function sendEmailOtpLoginAction(): Promise<AuthActionState> {
  const pending = await getPending2faUser();
  if (!pending) return { error: "Sessão expirada. Faça login novamente." };

  const code = randomOtpCode(6);
  const codeHash = await hashToken(code);
  await prisma.emailOtp.create({
    data: {
      userId: pending.id,
      purpose: "LOGIN_2FA",
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  const sent = await sendLoginOtpEmail({
    to: pending.email,
    name: pending.name,
    code,
  });
  if (!sent.ok) return { error: sent.error };
  await writeAuditLog({
    actorUserId: pending.id,
    action: "auth.2fa_email_sent",
    ip: await clientIp(),
  });
  return { ok: true, message: "Código enviado por e-mail." };
}

export async function verifyEmailOtpLoginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const pending = await getPending2faUser();
  if (!pending) return { error: "Sessão expirada. Faça login novamente." };

  const code = String(formData.get("code") ?? "").trim();
  const codeHash = await hashToken(code);
  const otp = await prisma.emailOtp.findFirst({
    where: {
      userId: pending.id,
      purpose: "LOGIN_2FA",
      consumedAt: null,
      expiresAt: { gt: new Date() },
      codeHash,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) {
    await writeAuditLog({
      actorUserId: pending.id,
      action: "auth.2fa_failed",
      meta: { method: "email" },
      ip: await clientIp(),
    });
    return { error: "Código inválido ou expirado." };
  }

  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: pending.id },
    data: { lastLoginAt: new Date() },
  });
  await setSessionCookie(pending);
  await clearPending2faCookie();
  await writeAuditLog({
    actorUserId: pending.id,
    action: "auth.login_ok",
    meta: { method: "email_otp" },
    ip: await clientIp(),
  });
  redirect("/dashboard");
}

export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  // Resposta genérica para não vazar existência
  const generic = {
    ok: true,
    message: "Se o e-mail existir, enviaremos um link de recuperação.",
  };
  if (!email) return generic;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt) return generic;

  const raw = randomToken(32);
  const tokenHash = await hashToken(raw);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const resetUrl = `${appBaseUrl()}/dashboard/recuperar/${raw}`;
  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.password_reset_requested",
    ip: await clientIp(),
  });
  return generic;
}

export async function resetPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { error: "Token inválido." };
  if (password !== confirm) return { error: "As senhas não coincidem." };

  const tokenHash = await hashToken(token);
  const row = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
  if (!row) return { error: "Link inválido ou expirado." };

  const strength = validateStrongPassword(password, {
    email: row.user.email,
  });
  if (!strength.ok) return { error: strength.error };

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);
  await writeAuditLog({
    actorUserId: row.userId,
    action: "auth.password_reset_completed",
    ip: await clientIp(),
  });
  redirect("/dashboard/login");
}

export async function changeOwnPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado." };

  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) {
    return { error: "Senha atual incorreta." };
  }
  if (password !== confirm) return { error: "As senhas não coincidem." };
  const strength = validateStrongPassword(password, { email: user.email });
  if (!strength.ok) return { error: strength.error };

  const passwordHash = await hashPassword(password);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  await setSessionCookie(updated);
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.password_changed",
    meta: { reason: "perfil" },
    ip: await clientIp(),
  });
  return { ok: true, message: "Senha atualizada." };
}

export async function updateOwnProfileAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome." };
  await prisma.user.update({
    where: { id: user.id },
    data: { name },
  });
  return { ok: true, message: "Perfil atualizado." };
}

export async function disableOwnTotpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado." };
  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "Senha incorreta." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecretEnc: null },
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.2fa_disabled",
    ip: await clientIp(),
  });
  return { ok: true, message: "2FA desativado. Configure novamente no próximo login se exigido." };
}

/** Utilitário interno: cria usuário com senha provisória (admin). */
export async function createUserWithProvisionalPassword(input: {
  email: string;
  name: string;
  roleId: string;
  dataScopeMode: "ALL" | "LIMITED";
  createdById: string;
}) {
  const provisional = generateProvisionalPassword();
  const passwordHash = await hashPassword(provisional);
  const user = await prisma.user.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash,
      roleId: input.roleId,
      dataScopeMode: input.dataScopeMode,
      mustChangePassword: true,
      totpEnabled: false,
      createdById: input.createdById,
    },
  });
  const loginUrl = `${appBaseUrl()}/dashboard/login`;
  await sendProvisionalPasswordEmail({
    to: user.email,
    name: user.name,
    password: provisional,
    loginUrl,
  });
  return { user, provisional };
}
