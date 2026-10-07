import { config } from "dotenv";

config({ path: ".env.local", override: true });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import {
  ACCESS_PERMISSION_IDS,
  ACCESS_BY_ID,
  ORIGEM_PRIVILEGED_CAPABILITIES,
} from "@max/auth";
import { PROTECTED_SUPERADMIN_EMAIL } from "../src/lib/protected-superadmin";

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

  const professorRole = await prisma.role.upsert({
    where: { name: "Professor" },
    update: {
      description:
        "MAX Fluxo: somente avaliação de respostas das oficinas atribuídas",
      isSystem: true,
    },
    create: {
      name: "Professor",
      description:
        "MAX Fluxo: somente avaliação de respostas das oficinas atribuídas",
      isSystem: true,
    },
  });

  const superRole = await prisma.role.upsert({
    where: { name: "Superadmin" },
    update: {
      description: "Conta raiz protegida — acesso total, não alterável",
      isSystem: true,
    },
    create: {
      name: "Superadmin",
      description: "Conta raiz protegida — acesso total, não alterável",
      isSystem: true,
    },
  });

  const privileged = new Set<string>(ORIGEM_PRIVILEGED_CAPABILITIES);

  for (const roleId of [adminRole.id, superRole.id]) {
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: ACCESS_PERMISSION_IDS.map((screen) => ({
        roleId,
        screen,
        canView: true,
        canEdit:
          ACCESS_BY_ID[screen]?.kind === "capability" || screen.endsWith(".edit"),
      })),
    });
  }

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

  const professorIds = ["cultural.home", "fluxo.app", "fluxo.formularios"] as const;
  await prisma.rolePermission.deleteMany({ where: { roleId: professorRole.id } });
  await prisma.rolePermission.createMany({
    data: professorIds.map((screen) => ({
      roleId: professorRole.id,
      screen,
      canView: true,
      canEdit: false,
    })),
  });

  const email = PROTECTED_SUPERADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "TroqueEstaSenha1!";
  const passwordHash = await bcrypt.hash(password, 12);
  const resetBootstrapPassword =
    process.env.BOOTSTRAP_ADMIN_RESET === "true" ||
    process.env.BOOTSTRAP_ADMIN_RESET === "1";

  const existingProtected = await prisma.user.findUnique({ where: { email } });
  if (!existingProtected) {
    await prisma.user.create({
      data: {
        email,
        name: "Superadmin",
        passwordHash,
        roleId: superRole.id,
        isSuperAdmin: true,
        mustChangePassword: false,
        totpEnabled: false,
      },
    });
  } else {
    // Nunca sobrescreve senha em produção/remoto sem BOOTSTRAP_ADMIN_RESET=true.
    await prisma.user.update({
      where: { id: existingProtected.id },
      data: {
        roleId: superRole.id,
        isSuperAdmin: true,
        deactivatedAt: null,
        ...(resetBootstrapPassword
          ? { passwordHash, mustChangePassword: false }
          : {}),
      },
    });
    if (resetBootstrapPassword) {
      console.log(`Senha do Superadmin ${email} redefinida (BOOTSTRAP_ADMIN_RESET).`);
    }
  }

  // Contas extras só para ambiente local (não apontam para o remoto).
  const dbUrl = process.env.DATABASE_URL || "";
  const isLocalDb =
    /localhost|127\.0\.0\.1/.test(dbUrl) && !/supabase|pooler/i.test(dbUrl);

  if (isLocalDb) {
    const demoPassword = process.env.DEMO_PASSWORD || password;
    const demoHash = await bcrypt.hash(demoPassword, 12);

    await prisma.user.upsert({
      where: { email: "admin@maxcultural.local" },
      update: {
        passwordHash: demoHash,
        roleId: superRole.id,
        isSuperAdmin: true,
        mustChangePassword: false,
        deactivatedAt: null,
        name: "Admin Local",
      },
      create: {
        email: "admin@maxcultural.local",
        name: "Admin Local",
        passwordHash: demoHash,
        roleId: superRole.id,
        isSuperAdmin: true,
        mustChangePassword: false,
        totpEnabled: false,
      },
    });

    await prisma.user.upsert({
      where: { email: "operador@maxcultural.local" },
      update: {
        passwordHash: demoHash,
        roleId: operador.id,
        isSuperAdmin: false,
        mustChangePassword: false,
        deactivatedAt: null,
        name: "Operador Demo",
      },
      create: {
        email: "operador@maxcultural.local",
        name: "Operador Demo",
        passwordHash: demoHash,
        roleId: operador.id,
        isSuperAdmin: false,
        mustChangePassword: false,
        totpEnabled: false,
      },
    });

    await prisma.user.upsert({
      where: { email: "professor@maxcultural.local" },
      update: {
        passwordHash: demoHash,
        roleId: professorRole.id,
        isSuperAdmin: false,
        mustChangePassword: false,
        deactivatedAt: null,
        name: "Professor Demo",
      },
      create: {
        email: "professor@maxcultural.local",
        name: "Professor Demo",
        passwordHash: demoHash,
        roleId: professorRole.id,
        isSuperAdmin: false,
        mustChangePassword: false,
        totpEnabled: false,
      },
    });

    console.log(
      "Seed local: admin@maxcultural.local + operador@maxcultural.local + professor@maxcultural.local",
    );
    console.log(`Senha demo: ${demoPassword}`);
  }

  console.log(`Seed ok. Superadmin protegido: ${email}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
