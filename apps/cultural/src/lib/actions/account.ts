"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSessionUser, setSessionCookie } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  validateStrongPassword,
  verifyPassword,
} from "@/lib/password";
import type { AuthActionState } from "@/lib/actions/auth";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function updateOwnProfileAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado." };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Informe o nome." };
  await prisma.user.update({
    where: { id: user.id },
    data: { name },
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.profile_updated",
    ip: await clientIp(),
  });
  revalidatePath("/conta");
  revalidatePath("/");
  return { ok: true, message: "Dados atualizados." };
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
    meta: { reason: "conta" },
    ip: await clientIp(),
  });
  revalidatePath("/conta");
  return { ok: true, message: "Senha atualizada." };
}
