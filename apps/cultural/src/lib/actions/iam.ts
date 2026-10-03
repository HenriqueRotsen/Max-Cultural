"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { generateProvisionalPassword, hashPassword } from "@/lib/password";
import {
  ACCESS_PERMISSION_IDS,
  ACCESS_BY_ID,
  normalizeGrantedIds,
} from "@max/auth";
import { sendInviteEmail } from "@/lib/email";

const USER_FLASH = "max_user_flash";

export type UserFlash = {
  email: string;
  provisional: string;
  kind: "created" | "password_reset";
};

async function setUserFlash(flash: UserFlash) {
  const jar = await cookies();
  jar.set(USER_FLASH, JSON.stringify(flash), {
    httpOnly: true,
    sameSite: "lax",
    path: "/usuarios",
    maxAge: 120,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function createUserAction(formData: FormData) {
  const actor = await getSessionUser();
  if (!actor || !can(actor, "cultural.usuarios", "edit")) {
    redirect("/usuarios?error=" + encodeURIComponent("Sem permissão."));
  }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "");
  if (!email || !name || !roleId) {
    redirect("/usuarios?error=" + encodeURIComponent("Preencha nome, e-mail e papel."));
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/usuarios?error=" + encodeURIComponent("Já existe usuário com este e-mail."));
  }

  const provisional = generateProvisionalPassword();
  await prisma.user.create({
    data: {
      email,
      name,
      roleId,
      passwordHash: await hashPassword(provisional),
      mustChangePassword: true,
      totpEnabled: false,
    },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.user_created",
    screen: "cultural.usuarios",
    entityType: "user",
    entityId: email,
  });
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const emailSimulated =
    process.env.AUTH_EMAIL_SIMULATE === "true" || !process.env.RESEND_API_KEY;
  await sendInviteEmail({
    to: email,
    name,
    link: `${site}/login`,
    provisionalPassword: emailSimulated ? undefined : provisional,
  });

  await setUserFlash({ email, provisional, kind: "created" });
  redirect("/usuarios?created=1");
}

export async function adminResetPasswordAction(userId: string) {
  const actor = await getSessionUser();
  if (!actor || !can(actor, "cultural.usuarios", "edit")) {
    redirect("/usuarios?error=" + encodeURIComponent("Sem permissão."));
  }
  if (userId === actor.id) {
    redirect(
      "/usuarios?error=" +
        encodeURIComponent("Use Minha conta para alterar a própria senha."),
    );
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    redirect("/usuarios?error=" + encodeURIComponent("Usuário não encontrado."));
  }

  const provisional = generateProvisionalPassword();
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(provisional),
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.password_reset",
    screen: "cultural.usuarios",
    entityType: "user",
    entityId: userId,
  });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const emailSimulated =
    process.env.AUTH_EMAIL_SIMULATE === "true" || !process.env.RESEND_API_KEY;
  await sendInviteEmail({
    to: target.email,
    name: target.name,
    link: `${site}/login`,
    provisionalPassword: emailSimulated ? undefined : provisional,
  });

  await setUserFlash({
    email: target.email,
    provisional,
    kind: "password_reset",
  });
  redirect("/usuarios?passwordReset=1");
}

export async function peekUserFlash(): Promise<UserFlash | null> {
  const jar = await cookies();
  const raw = jar.get(USER_FLASH)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserFlash>;
    if (!parsed.email || !parsed.provisional) return null;
    const kind =
      parsed.kind === "password_reset" ? "password_reset" : "created";
    return { email: parsed.email, provisional: parsed.provisional, kind };
  } catch {
    return null;
  }
}

export async function toggleUserAction(userId: string) {
  const actor = await getSessionUser();
  if (!actor || !can(actor, "cultural.usuarios", "edit")) {
    redirect("/usuarios?error=" + encodeURIComponent("Sem permissão."));
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    redirect("/usuarios?error=" + encodeURIComponent("Usuário não encontrado."));
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      deactivatedAt: user.deactivatedAt ? null : new Date(),
      sessionVersion: { increment: 1 },
    },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: user.deactivatedAt ? "iam.user_activated" : "iam.user_deactivated",
    screen: "cultural.usuarios",
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/usuarios");
}

export async function saveRolePermissionsAction(formData: FormData) {
  const actor = await getSessionUser();
  if (!actor || !can(actor, "cultural.papeis", "edit")) {
    redirect("/papeis?error=" + encodeURIComponent("Sem permissão."));
  }
  const roleId = String(formData.get("roleId") ?? "");
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    redirect("/papeis?error=" + encodeURIComponent("Papel inválido."));
  }

  const raw = ACCESS_PERMISSION_IDS.filter(
    (id) => formData.get(`grant:${id}`) === "on",
  );
  const granted = normalizeGrantedIds(raw);

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: granted.map((screen) => ({
        roleId,
        screen,
        canView: true,
        canEdit: screen.endsWith(".edit") || ACCESS_BY_ID[screen]?.kind === "capability",
      })),
    }),
    // Encerra sessões de todos os usuários deste papel (Cultural + satélites).
    prisma.user.updateMany({
      where: { roleId },
      data: { sessionVersion: { increment: 1 } },
    }),
  ]);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.role_updated",
    screen: "cultural.papeis",
    entityType: "role",
    entityId: roleId,
    meta: { sessionsInvalidated: true },
  });
  revalidatePath("/papeis");
  revalidatePath(`/papeis/${roleId}`);
  redirect(`/papeis/${roleId}?saved=1`);
}

/** Salva overrides granulares (GRANT/DENY) por usuário; papel continua como padrão. */
export async function saveUserPermissionsAction(formData: FormData) {
  const actor = await getSessionUser();
  if (!actor || !can(actor, "cultural.usuarios", "edit")) {
    redirect("/usuarios?error=" + encodeURIComponent("Sem permissão."));
  }
  const userId = String(formData.get("userId") ?? "");
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, isSuperAdmin: true },
  });
  if (!target) {
    redirect("/usuarios?error=" + encodeURIComponent("Usuário não encontrado."));
  }
  if (target.isSuperAdmin) {
    redirect(
      `/usuarios/${userId}?error=` +
        encodeURIComponent("Superadmin tem acesso total — overrides não se aplicam."),
    );
  }

  const rows: Array<{ userId: string; screen: string; effect: "GRANT" | "DENY" }> =
    [];
  for (const id of ACCESS_PERMISSION_IDS) {
    const raw = String(formData.get(`override:${id}`) ?? "").trim();
    if (raw === "GRANT" || raw === "DENY") {
      rows.push({ userId, screen: id, effect: raw });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId } });
    if (rows.length) {
      await tx.userPermission.createMany({ data: rows });
    }
    await tx.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.user_permissions_updated",
    screen: "cultural.usuarios",
    entityType: "user",
    entityId: userId,
    meta: { overrides: rows.length },
  });
  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${userId}`);
  redirect(`/usuarios/${userId}?saved=1`);
}

/** Troca o papel do usuário e invalida a sessão atual dele. */
export async function updateUserRoleAction(formData: FormData) {
  const actor = await getSessionUser();
  if (!actor || !can(actor, "cultural.usuarios", "edit")) {
    redirect("/usuarios?error=" + encodeURIComponent("Sem permissão."));
  }
  const userId = String(formData.get("userId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  if (!userId || !roleId) {
    redirect("/usuarios?error=" + encodeURIComponent("Dados inválidos."));
  }
  const [target, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.role.findUnique({ where: { id: roleId } }),
  ]);
  if (!target || !role) {
    redirect("/usuarios?error=" + encodeURIComponent("Usuário ou papel inválido."));
  }
  if (target.roleId === roleId) {
    redirect("/usuarios");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      roleId,
      sessionVersion: { increment: 1 },
    },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.user_role_changed",
    screen: "cultural.usuarios",
    entityType: "user",
    entityId: userId,
    meta: { roleId, previousRoleId: target.roleId },
  });
  revalidatePath("/usuarios");
  redirect("/usuarios?roleUpdated=1");
}

export async function createRoleAction(formData: FormData) {
  const actor = await getSessionUser();
  if (!actor || !can(actor, "cultural.papeis", "edit")) {
    redirect("/papeis?error=" + encodeURIComponent("Sem permissão."));
  }
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/papeis?error=" + encodeURIComponent("Informe o nome do papel."));
  }
  const role = await prisma.role.create({
    data: { name, description: String(formData.get("description") ?? "").trim() },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.role_created",
    screen: "cultural.papeis",
    entityType: "role",
    entityId: role.id,
  });
  revalidatePath("/papeis");
  redirect(`/papeis/${role.id}`);
}
