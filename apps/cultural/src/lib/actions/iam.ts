"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { generateProvisionalPassword, hashPassword } from "@/lib/password";
import { SCREEN_IDS } from "@/lib/screens";
import { sendInviteEmail } from "@/lib/email";

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
  await sendInviteEmail({
    to: email,
    name,
    link: `${site}/login`,
  });
  redirect(
    `/usuarios?created=1&email=${encodeURIComponent(email)}&temp=${encodeURIComponent(provisional)}`,
  );
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

  const rows = SCREEN_IDS.map((screen) => ({
    roleId,
    screen,
    canView: formData.get(`view:${screen}`) === "on",
    canEdit: formData.get(`edit:${screen}`) === "on",
  }));

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({ data: rows.filter((r) => r.canView || r.canEdit) }),
  ]);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.role_updated",
    screen: "cultural.papeis",
    entityType: "role",
    entityId: roleId,
  });
  revalidatePath("/papeis");
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
  await prisma.role.create({
    data: { name, description: String(formData.get("description") ?? "").trim() },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "iam.role_created",
    screen: "cultural.papeis",
    entityType: "role",
    entityId: name,
  });
  revalidatePath("/papeis");
}
