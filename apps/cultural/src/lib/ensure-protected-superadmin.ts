import {
  ACCESS_BY_ID,
  ACCESS_PERMISSION_IDS,
} from "@max/auth";
import { prisma } from "@/lib/db";
import {
  PROTECTED_SUPERADMIN_EMAIL,
  SUPERADMIN_ROLE_NAME,
} from "@/lib/protected-superadmin";

/** Garante papel Superadmin (sistema) + conta protegida com isSuperAdmin. */
export async function ensureProtectedSuperAdmin(opts?: {
  /** Se o usuário ainda não existir, cria com este hash (só seed). */
  passwordHash?: string;
  name?: string;
}) {
  const superRole = await prisma.role.upsert({
    where: { name: SUPERADMIN_ROLE_NAME },
    update: {
      description: "Conta raiz protegida — acesso total, não alterável",
      isSystem: true,
    },
    create: {
      name: SUPERADMIN_ROLE_NAME,
      description: "Conta raiz protegida — acesso total, não alterável",
      isSystem: true,
    },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: superRole.id } });
  await prisma.rolePermission.createMany({
    data: ACCESS_PERMISSION_IDS.map((screen) => ({
      roleId: superRole.id,
      screen,
      canView: true,
      canEdit:
        ACCESS_BY_ID[screen]?.kind === "capability" || screen.endsWith(".edit"),
    })),
  });

  const existing = await prisma.user.findUnique({
    where: { email: PROTECTED_SUPERADMIN_EMAIL },
  });

  if (!existing) {
    if (!opts?.passwordHash) {
      return { roleId: superRole.id, created: false as const, missingUser: true as const };
    }
    await prisma.user.create({
      data: {
        email: PROTECTED_SUPERADMIN_EMAIL,
        name: opts.name || "Superadmin",
        passwordHash: opts.passwordHash,
        roleId: superRole.id,
        isSuperAdmin: true,
        mustChangePassword: false,
        totpEnabled: false,
        deactivatedAt: null,
      },
    });
    return { roleId: superRole.id, created: true as const, missingUser: false as const };
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      roleId: superRole.id,
      isSuperAdmin: true,
      deactivatedAt: null,
    },
  });

  return { roleId: superRole.id, created: false as const, missingUser: false as const };
}
