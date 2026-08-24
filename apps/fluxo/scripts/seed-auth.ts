/**
 * Seed de permissões, papéis e admin bootstrap.
 * Uso: npx tsx scripts/seed-auth.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import {
  ADMIN_ROLE_NAME,
  OPERATOR_ROLE_NAME,
  PERMISSION_CATALOG,
} from "../lib/permission-catalog";
import { hashPassword } from "../lib/password";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada");

  const pool = new Pool({ connectionString });
  const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, schema ? { schema } : undefined),
  });

  try {
    for (const p of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code: p.code },
        create: {
          code: p.code,
          label: p.label,
          group: p.group,
          description: p.description ?? "",
        },
        update: {
          label: p.label,
          group: p.group,
          description: p.description ?? "",
        },
      });
    }
    console.log(`Permissions: ${PERMISSION_CATALOG.length}`);

    const allPerms = await prisma.permission.findMany();
    const byCode = new Map(allPerms.map((p) => [p.code, p.id]));

    const adminRole = await prisma.role.upsert({
      where: { name: ADMIN_ROLE_NAME },
      create: {
        name: ADMIN_ROLE_NAME,
        description:
          "Papel de painel com todas as permissões e acesso total aos dados",
        isSystem: true,
        dataScopeMode: "ALL",
      },
      update: {
        description:
          "Papel de painel com todas as permissões e acesso total aos dados",
        isSystem: true,
        dataScopeMode: "ALL",
      },
    });

    const operatorRole = await prisma.role.upsert({
      where: { name: OPERATOR_ROLE_NAME },
      create: {
        name: OPERATOR_ROLE_NAME,
        description: "Operação do dia a dia (sem gerenciar acesso)",
        isSystem: true,
        dataScopeMode: "LIMITED",
      },
      update: {
        description: "Operação do dia a dia (sem gerenciar acesso)",
        isSystem: true,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
    await prisma.rolePermission.createMany({
      data: allPerms.map((p) => ({
        roleId: adminRole.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });

    const operatorCodes = [
      "dashboard:access",
      "inscricoes:read",
      "inscricoes:write",
      "inscricoes:export",
      "analise:read",
      "analise:export",
      "contextos:read",
      "contextos:create",
      "import:write",
      "consultas:cpf",
      "consultas:territorio",
      "perfil:write",
    ];
    await prisma.rolePermission.deleteMany({ where: { roleId: operatorRole.id } });
    await prisma.rolePermission.createMany({
      data: operatorCodes
        .map((c) => byCode.get(c))
        .filter(Boolean)
        .map((permissionId) => ({
          roleId: operatorRole.id,
          permissionId: permissionId!,
        })),
      skipDuplicates: true,
    });
    console.log(`Roles: ${ADMIN_ROLE_NAME}, ${OPERATOR_ROLE_NAME}`);

    const email = (
      process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() ||
      "admin@maxfluxo.local"
    ).toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const resetPassword =
      process.env.BOOTSTRAP_ADMIN_RESET === "true" ||
      process.env.BOOTSTRAP_ADMIN_RESET === "1";
    if (password) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) {
        const passwordHash = await hashPassword(password);
        await prisma.user.create({
          data: {
            email,
            name: "Superadmin",
            passwordHash,
            // Papel técnico mínimo; o acesso real vem de isSuperAdmin.
            roleId: operatorRole.id,
            isSuperAdmin: true,
            dataScopeMode: "ALL",
            mustChangePassword: false,
            totpEnabled: false,
          },
        });
        console.log(`Bootstrap superadmin criado: ${email}`);
      } else if (resetPassword) {
        const passwordHash = await hashPassword(password);
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            name: existing.name || "Superadmin",
            roleId: operatorRole.id,
            isSuperAdmin: true,
            dataScopeMode: "ALL",
            deactivatedAt: null,
            mustChangePassword: false,
            totpEnabled: false,
            totpSecretEnc: null,
          },
        });
        console.log(
          `Bootstrap superadmin senha redefinida (BOOTSTRAP_ADMIN_RESET): ${email}`,
        );
      } else {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            isSuperAdmin: true,
            dataScopeMode: "ALL",
            roleId: operatorRole.id,
            deactivatedAt: null,
          },
        });
        console.log(
          `Bootstrap superadmin já existe: ${email} (flag isSuperAdmin reforçada; senha do .env NÃO é aplicada; use BOOTSTRAP_ADMIN_RESET=true para redefinir)`,
        );
      }
    } else {
      console.log(
        "Defina BOOTSTRAP_ADMIN_PASSWORD para criar o superadmin inicial.",
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
