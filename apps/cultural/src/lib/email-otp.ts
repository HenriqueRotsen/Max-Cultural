import { prisma } from "@/lib/db";
import { sendLoginOtpEmail } from "@/lib/email";
import { hashToken, randomOtpCode } from "@/lib/password";

const OTP_TTL_MS = 10 * 60 * 1000;

/** Gera e envia código de login por e-mail. Invalida códigos anteriores não usados. */
export async function issueLoginEmailOtp(user: {
  id: string;
  email: string;
  name: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = randomOtpCode(6);
  const codeHash = await hashToken(code);

  await prisma.emailOtp.updateMany({
    where: {
      userId: user.id,
      purpose: "LOGIN_2FA",
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });

  await prisma.emailOtp.create({
    data: {
      userId: user.id,
      purpose: "LOGIN_2FA",
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  const sent = await sendLoginOtpEmail({
    to: user.email,
    name: user.name,
    code,
  });
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ok: true };
}

export async function verifyLoginEmailOtp(
  userId: string,
  code: string,
): Promise<boolean> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;
  const codeHash = await hashToken(trimmed);
  const otp = await prisma.emailOtp.findFirst({
    where: {
      userId,
      purpose: "LOGIN_2FA",
      consumedAt: null,
      expiresAt: { gt: new Date() },
      codeHash,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return false;
  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
  return true;
}
