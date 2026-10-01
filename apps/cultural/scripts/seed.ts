import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import {
  ACCESS_PERMISSION_IDS,
  ACCESS_BY_ID,
  ORIGEM_PRIVILEGED_CAPABILITIES,
} from "@max/auth";

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
      description: "Origem e Fluxo operacionais, sem IAM nem capacidades privilegiadas",
      isSystem: true,
    },
  });

  const privileged = new Set<string>(ORIGEM_PRIVILEGED_CAPABILITIES);

  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: ACCESS_PERMISSION_IDS.map((screen) => ({
      roleId: adminRole.id,
      screen,
      canView: true,
      canEdit:
        ACCESS_BY_ID[screen]?.kind === "capability" || screen.endsWith(".edit"),
    })),
  });

  const operador = await prisma.role.findUniqueOrThrow({ where: { name: "Operador" } });
  const operadorIds = ACCESS_PERMISSION_IDS.filter((id) => {
    if (privileged.has(id)) return false;
    if (id.startsWith("cultural.usuarios")) return false;
    if (id.startsWith("cultural.papeis")) return false;
    if (id === "cultural.logs") return false;
    return (
      id === "cultural.home" ||
      id === "cultural.projetos" ||
      id.startsWith("origem.") ||
      id.startsWith("fluxo.")
    );
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: operador.id } });
  await prisma.rolePermission.createMany({
    data: operadorIds.map((screen) => ({
      roleId: operador.id,
      screen,
      canView: true,
      canEdit:
        ACCESS_BY_ID[screen]?.kind === "capability" || screen.endsWith(".edit"),
    })),
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
