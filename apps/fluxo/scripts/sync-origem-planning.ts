/**
 * Backfill one-shot: espelha projetos existentes do Planejamento (Origem) no Fluxo.
 * Uso: npm run sync:origem-planning -w max-fluxo
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import pg from "pg";
import {
  provisionProjetoFromOrigem,
  ProvisionNeedsContextoError,
} from "../lib/hub/provision-projeto";

config({ path: ".env.local" });

const origemEnv = config({
  path: resolve(__dirname, "../../origem/.env.local"),
});

const ORIGEM_DATABASE_URL =
  process.env.ORIGEM_DATABASE_URL || origemEnv.parsed?.DATABASE_URL;

type OrigemRow = {
  external_code: string;
  name: string | null;
  proponente: string;
};

async function loadOrigemProjects(): Promise<OrigemRow[]> {
  if (!ORIGEM_DATABASE_URL) {
    throw new Error(
      "Defina ORIGEM_DATABASE_URL ou configure DATABASE_URL em apps/origem/.env.local",
    );
  }
  const client = new pg.Client({ connectionString: ORIGEM_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<OrigemRow>(`
      SELECT
        pp."externalCode" AS external_code,
        pp.name,
        sa.name AS proponente
      FROM planning_projects pp
      JOIN "SalicAccount" sa ON sa.id = pp."accountId"
      ORDER BY pp."externalCode" ASC
    `);
    return rows;
  } finally {
    await client.end();
  }
}

async function main() {
  const rows = await loadOrigemProjects();
  console.log(`Projetos no Planejamento (Origem): ${rows.length}\n`);

  let created = 0;
  let updated = 0;
  let contextCreated = 0;
  let failed = 0;

  for (const row of rows) {
    const pronac = row.external_code.trim();
    const nome = (row.name?.trim() || pronac).trim();
    const label = `${pronac} — ${nome}`;

    try {
      const result = await provisionProjetoFromOrigem({
        pronac,
        nome,
        proponente: row.proponente,
        autoMatchContexto: true,
        createContexto: true,
      });

      if (result.created) created += 1;
      else updated += 1;
      if (result.contextoCreated) contextCreated += 1;

      console.log(
        `${result.created ? "✓ criado" : "↻ atualizado"} | ${label}`,
        `→ contexto "${result.projeto.contextoNome}" (${result.projeto.contextoId})`,
      );
    } catch (error) {
      failed += 1;
      if (error instanceof ProvisionNeedsContextoError) {
        console.warn(
          `⚠ ambíguo/sem contexto | ${label}`,
          `→ sugerido "${error.resolve.suggestedNome}"`,
          error.resolve.candidates.map((c) => c.nome).join(", ") || "(nenhum candidato)",
        );
      } else {
        console.warn(
          `✗ erro | ${label}`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  console.log("\n---");
  console.log(
    `Criados: ${created} | Atualizados: ${updated} | Contextos novos: ${contextCreated} | Falhas: ${failed}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
