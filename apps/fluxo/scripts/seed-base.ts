/**
 * Seed da base a partir do CSV/XLSX oficial (35 colunas).
 *
 * Uso:
 *   npx tsx scripts/seed-base.ts
 *   npx tsx scripts/seed-base.ts /caminho/arquivo.csv
 *   npx tsx scripts/seed-base.ts --replace "/caminho/Base Completa.xlsx"
 *
 * Em XLSX, prioriza a aba "Base 2026" (senão a primeira).
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import Papa from "papaparse";
import * as XLSX from "@e965/xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { normalizeRow } from "../lib/normalize";
import { rowToPrisma, type SigaCulturalRow } from "../lib/schema";

config({ path: ".env.local", override: true });

const BATCH = 250;
const PREFERRED_SHEETS = ["Base 2026", "Base Completa", "base"];

function parseArgs(argv: string[]) {
  const replace = argv.includes("--replace");
  const fileArg = argv.find((a) => !a.startsWith("-"));
  return {
    replace,
    file: resolve(fileArg ?? "data/base-completa-2026.csv"),
  };
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const yyyy = value.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return String(value).trim();
}

function rowsFromFile(file: string): Record<string, unknown>[] {
  const ext = extname(file).toLowerCase();

  if (ext === ".csv") {
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
    return (parsed.data ?? []).filter((r) =>
      Object.values(r).some((v) => String(v ?? "").trim() !== ""),
    );
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = XLSX.read(readFileSync(file), {
      type: "buffer",
      cellDates: true,
    });
    const preferred = PREFERRED_SHEETS.find((name) =>
      workbook.SheetNames.some((s) => s.toLowerCase() === name.toLowerCase()),
    );
    const sheetName =
      workbook.SheetNames.find(
        (s) => preferred && s.toLowerCase() === preferred.toLowerCase(),
      ) ?? workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("Planilha sem abas");
    }
    console.log(`Aba XLSX: ${sheetName}`);
    const sheet = workbook.Sheets[sheetName]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
      dateNF: "dd/mm/yyyy",
    });
    return rows
      .map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          out[k] = cellToString(v);
        }
        return out;
      })
      .filter((r) =>
        Object.values(r).some((v) => String(v ?? "").trim() !== ""),
      );
  }

  throw new Error(`Formato não suportado: ${ext || "(sem extensão)"}`);
}

async function main() {
  const { replace, file } = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada");
  }

  const rawRows = rowsFromFile(file);
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
  const schema =
    new URL(connectionString).searchParams.get("schema") ?? undefined;
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
