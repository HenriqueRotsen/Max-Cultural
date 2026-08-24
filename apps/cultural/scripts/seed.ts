import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { SCREENS } from "../src/lib/screens";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const adminRole = await prisma.role.upsert({
    where: { name: "Administrador" },
    update: {},
    create: {
      name: "Administrador",
      description: "Acesso total ao hub e aos produtos",
      isSystem: true,
    },
  });

  await prisma.role.upsert({
    where: { name: "Operador" },
    update: {},
    create: {
      name: "Operador",
      description: "Origem e Fluxo, sem IAM",
      isSystem: true,
    },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: SCREENS.map((s) => ({
      roleId: adminRole.id,
      screen: s.id,
      canView: true,
      canEdit: true,
    })),
  });

  const operador = await prisma.role.findUniqueOrThrow({ where: { name: "Operador" } });
  await prisma.rolePermission.deleteMany({ where: { roleId: operador.id } });
  await prisma.rolePermission.createMany({
    data: [
      { roleId: operador.id, screen: "cultural.home", canView: true, canEdit: false },
      { roleId: operador.id, screen: "origem.app", canView: true, canEdit: true },
      { roleId: operador.id, screen: "origem.auditoria", canView: true, canEdit: true },
      { roleId: operador.id, screen: "origem.fornecedores", canView: true, canEdit: true },
      { roleId: operador.id, screen: "fluxo.app", canView: true, canEdit: true },
      { roleId: operador.id, screen: "fluxo.operacao", canView: true, canEdit: true },
      { roleId: operador.id, screen: "fluxo.consultas", canView: true, canEdit: true },
    ],
  });

  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@maxcultural.local").toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "TroqueEstaSenha1!";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      roleId: adminRole.id,
      isSuperAdmin: true,
      mustChangePassword: false,
      deactivatedAt: null,
    },
    create: {
      email,
      name: "Administrador",
      passwordHash,
      roleId: adminRole.id,
      isSuperAdmin: true,
      mustChangePassword: false,
      totpEnabled: false,
    },
  });

  console.log(`Seed ok. Admin: ${email}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
