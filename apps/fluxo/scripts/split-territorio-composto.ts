/**
 * Corrige dados legados em que Territorio vinha como "Cidade/Comunidade".
 * Uso: npx tsx scripts/split-territorio-composto.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { splitCidadeTerritorio } from "../lib/normalize";

async function main() {
  const rows = await prisma.inscricao.findMany({
    select: { id: true, cidade: true, territorio: true },
  });

  let updated = 0;
  for (const row of rows) {
    if (!row.territorio.includes("/") && !row.cidade.includes("/")) continue;
    const next = splitCidadeTerritorio({
      Cidade: row.cidade,
      Territorio: row.territorio,
    });
    if (next.Cidade === row.cidade && next.Territorio === row.territorio) {
      continue;
    }
    await prisma.inscricao.update({
      where: { id: row.id },
      data: { cidade: next.Cidade, territorio: next.Territorio },
    });
    updated += 1;
  }

  console.log(`Atualizadas ${updated} inscrição(ões) de ${rows.length}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
