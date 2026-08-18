/**
 * Infere UF a partir da cidade e promove município legado em territorio.
 * Uso: npx tsx scripts/fix-geo-territorio.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { enrichCidadeEstado } from "../lib/municipio-uf";

async function main() {
  const rows = await prisma.inscricao.findMany({
    select: {
      id: true,
      cidade: true,
      estado: true,
      territorio: true,
    },
  });

  console.log(`Carregadas ${rows.length} linhas…`);

  const updates: Array<{
    id: string;
    estado: string;
    cidade: string;
    territorio: string;
  }> = [];

  for (const row of rows) {
    const next = enrichCidadeEstado({
      cidade: row.cidade,
      estado: row.estado,
      territorio: row.territorio,
    });
    if (
      next.cidade === row.cidade &&
      next.estado === row.estado &&
      next.territorio === row.territorio
    ) {
      continue;
    }
    updates.push({ id: row.id, ...next });
  }

  console.log(`A atualizar: ${updates.length}`);

  const CONCURRENCY = 40;
  let done = 0;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map((u) =>
        prisma.inscricao.update({
          where: { id: u.id },
          data: {
            estado: u.estado,
            cidade: u.cidade,
            territorio: u.territorio,
          },
        }),
      ),
    );
    done += chunk.length;
    if (done % 200 === 0 || done === updates.length) {
      console.log(`  ${done}/${updates.length}`);
    }
  }

  console.log(`Geo atualizado: ${updates.length} de ${rows.length}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
