/**
 * Normaliza Identificacao_ano_projeto para YYYY quando possível (batch).
 * Uso: npx tsx scripts/fix-ano-projeto.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { extractProjectYear } from "../lib/normalize";

async function fixTable(
  label: string,
  rows: { id: string; value: string }[],
  update: (id: string, year: string) => Promise<unknown>,
) {
  const batches = new Map<string, string[]>();
  for (const row of rows) {
    const year = extractProjectYear(row.value);
    if (!year || year === row.value) continue;
    const list = batches.get(year) ?? [];
    list.push(row.id);
    batches.set(year, list);
  }

  let updated = 0;
  for (const [year, ids] of batches) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      await Promise.all(chunk.map((id) => update(id, year)));
      updated += chunk.length;
    }
  }
  console.log(`${label}: ${updated} de ${rows.length}.`);
}

async function main() {
  const [inscricoes, projetos] = await Promise.all([
    prisma.inscricao.findMany({
      select: { id: true, identificacaoAnoProjeto: true },
    }),
    prisma.projeto.findMany({
      select: { id: true, ano: true },
    }),
  ]);

  await fixTable(
    "Inscrições",
    inscricoes.map((r) => ({ id: r.id, value: r.identificacaoAnoProjeto })),
    (id, year) =>
      prisma.inscricao.update({
        where: { id },
        data: { identificacaoAnoProjeto: year },
      }),
  );

  await fixTable(
    "Projetos",
    projetos.map((r) => ({ id: r.id, value: r.ano })),
    (id, year) =>
      prisma.projeto.update({
        where: { id },
        data: { ano: year },
      }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
