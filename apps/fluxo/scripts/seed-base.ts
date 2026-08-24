/**
 * Seed da base a partir do CSV oficial (35 colunas).
 *
 * Uso:
 *   npx tsx scripts/seed-base.ts
 *   npx tsx scripts/seed-base.ts /caminho/arquivo.csv
 *   npx tsx scripts/seed-base.ts --replace   # apaga inscricoes/contextos antes
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { normalizeRow } from "../lib/normalize";
import { rowToPrisma, type SigaCulturalRow } from "../lib/schema";

config({ path: ".env.local", override: true });

const BATCH = 250;

function parseArgs(argv: string[]) {
  const replace = argv.includes("--replace");
  const fileArg = argv.find((a) => !a.startsWith("-"));
  return {
    replace,
    file: resolve(
      fileArg ?? "data/base-completa-2026.csv",
    ),
  };
}

async function main() {
  const { replace, file } = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada");
  }

  const text = readFileSync(file, "utf-8");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (parsed.errors.length) {
    console.warn(
      `Avisos CSV: ${parsed.errors.slice(0, 5).map((e) => e.message).join("; ")}`,
    );
  }

  const rawRows = (parsed.data ?? []).filter((r) =>
    Object.values(r).some((v) => String(v ?? "").trim() !== ""),
  );
  console.log(`Arquivo: ${file}`);
  console.log(`Linhas brutas: ${rawRows.length}`);

  const rows: SigaCulturalRow[] = [];
  const errors: Array<{ index: number; message: string }> = [];
  for (let i = 0; i < rawRows.length; i++) {
    try {
      rows.push(normalizeRow(rawRows[i]!));
    } catch (err) {
      errors.push({
        index: i + 2,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (errors.length) {
    console.error(`Falhas de normalização: ${errors.length}`);
    for (const e of errors.slice(0, 10)) {
      console.error(`  linha ${e.index}: ${e.message}`);
    }
    if (errors.length > rows.length * 0.05) {
      throw new Error("Muitos erros — abortando seed.");
    }
  }
  console.log(`Linhas válidas: ${rows.length}`);

  const pool = new Pool({ connectionString });
  const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
  console.log(`Postgres schema: ${schema ?? "public"}`);
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, schema ? { schema } : undefined),
  });

  try {
    if (replace) {
      const delIns = await prisma.inscricao.deleteMany();
      const delOf = await prisma.oficina.deleteMany();
      const delProj = await prisma.projeto.deleteMany();
      const delCtx = await prisma.contexto.deleteMany();
      console.log(
        `Replace: removidas ${delIns.count} inscrição(ões), ${delOf.count} oficinas, ${delProj.count} projetos, ${delCtx.count} contextos`,
      );
    }

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH).map((row) => rowToPrisma(row));
      const result = await prisma.inscricao.createMany({ data: chunk });
      inserted += result.count;
      process.stdout.write(
        `\rInserindo inscrições… ${Math.min(i + BATCH, rows.length)}/${rows.length}`,
      );
    }
    console.log(`\nInscrições inseridas: ${inserted}`);
    console.log(
      "Hierarquia Contexto→Projeto→Oficina: rode `npx tsx scripts/migrate-hierarquia-contexto.ts` se necessário.",
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
