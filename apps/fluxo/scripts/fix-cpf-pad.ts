/**
 * Preenche zero à esquerda em CPFs com 10 dígitos (batch SQL).
 * Uso: npx tsx scripts/fix-cpf-pad.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";

async function main() {
  // 10 dígitos numéricos → pad com 0 à esquerda
  const result = await prisma.$executeRaw`
    UPDATE inscricoes
    SET "CPF" = '0' || "CPF"
    WHERE "CPF" ~ '^[0-9]{10}$'
  `;
  console.log(`CPFs atualizados: ${result}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
