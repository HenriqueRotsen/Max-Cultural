/**
 * Seed mínimo e seguro para produção: só cria/atualiza o papel Professor
 * e a tela fluxo.formularios. Não mexe em usuários, senhas nem outros papéis.
 *
 * Uso (com DATABASE_URL de produção no ambiente):
 *   npx tsx scripts/seed-professor-role.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ACCESS_BY_ID } from "@max/auth";

const PROFESSOR_SCREENS = ["cultural.home", "fluxo.app", "fluxo.formularios"] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  if (/localhost|127\.0\.0\.1/.test(url)) {
    console.warn("Aviso: DATABASE_URL parece local. Confirme se é o banco desejado.");
  }

  for (const screen of PROFESSOR_SCREENS) {
    if (!ACCESS_BY_ID[screen]) {
      throw new Error(`Tela ausente no catálogo @max/auth: ${screen}`);
    }
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    const role = await prisma.role.upsert({
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

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: PROFESSOR_SCREENS.map((screen) => ({
        roleId: role.id,
        screen,
        canView: true,
        canEdit: false,
      })),
    });

    console.log(`OK: papel Professor (${role.id}) com ${PROFESSOR_SCREENS.join(", ")}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
