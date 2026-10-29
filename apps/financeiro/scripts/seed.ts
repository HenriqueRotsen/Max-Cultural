import { config } from "dotenv";
import { prisma } from "../src/lib/db";
import { encryptCredential } from "../src/lib/crypto";

config({ path: ".env.local", override: true });

async function main() {
  const dbUrl = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(dbUrl)) {
    throw new Error(
      "db:seed do Financeiro só deve rodar no Postgres local (apaga dados). Use npm run db:use-local.",
    );
  }

  await prisma.salicAccount.deleteMany();
  await prisma.complianceRuleset.deleteMany();

  const { ensureDefaultRuleset } = await import("../src/lib/compliance/rules");
  await ensureDefaultRuleset();

  const { ensureBootstrapWorkspace } = await import("../src/lib/auth/workspace");
  const workspace = await ensureBootstrapWorkspace();

  const a1 = await prisma.salicAccount.create({
    data: {
      name: "Proponente Alpha",
      cgccpf: "11111111000191",
      salicUsernameEnc: encryptCredential("alpha"),
      personType: "PJ",
      active: true,
      workspaceId: workspace.id,
    },
  });
  const a2 = await prisma.salicAccount.create({
    data: {
      name: "Proponente Beta",
      cgccpf: "22222222000172",
      personType: "PJ",
      active: true,
      workspaceId: workspace.id,
    },
  });

  console.log(`Proponentes de demonstração: ${a1.name}, ${a2.name}`);
  // Dados da Auditoria (projetos/pagamentos) são do app MAX Auditoria.
  console.log("Seed OK");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
