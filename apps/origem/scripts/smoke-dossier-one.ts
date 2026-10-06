/**
 * Smoke test: 1 PRONAC com anexos reais.
 * Uso: npx tsx scripts/smoke-dossier-one.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, rm, readdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { buildPronacDossier } from "@/lib/dossier/build";

const ACCOUNT_ID = "cmurdcif1001v04l5x5r3e616"; // Atelie 22
const PRONAC = "220692";

async function main() {
  const project = await prisma.project.findFirstOrThrow({
    where: { salicAccountId: ACCOUNT_ID, pronac: PRONAC },
    include: { salicAccount: true },
  });
  const out = path.join(
    process.cwd(),
    "exports/dossiers/_smoke",
    `PRONAC_${PRONAC}`,
  );
  await rm(out, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(out, { recursive: true });

  console.log("Building", PRONAC, "→", out);
  const built = await buildPronacDossier({
    workspaceId: project.salicAccount.workspaceId,
    accountId: ACCOUNT_ID,
    projectId: project.id,
    jobId: `smoke-${PRONAC}`,
    outputDir: out,
    rpa: {
      enabled: true,
      maxFiles: 15, // amostra rápida
      budgetMs: 10 * 60 * 1000,
    },
  });

  console.log("artifacts", built.artifacts.length);
  console.log("limitations", built.limitations);
  const salicDir = path.join(out, "05_pagamentos_comprovantes/salic");
  const execDir = path.join(out, "05_pagamentos_comprovantes/execucao_fisica");
  for (const d of [salicDir, execDir]) {
    try {
      const files = await readdir(d);
      console.log(d.split("/").slice(-2).join("/"), files.length, files.slice(0, 8));
    } catch {
      console.log(d.split("/").slice(-2).join("/"), "MISSING");
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
