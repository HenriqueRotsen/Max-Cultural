/**
 * Corrige textos já gravados com caracteres quebrados do SALIC (cp1252/UTF-8 lidos
 * como Latin-1). Sem --apply só mostra o antes → depois.
 *
 *   DATABASE_URL=... npx tsx scripts/fix-salic-encoding.ts [--apply]
 */
import pg from "pg";
import { fixSalicEncoding } from "../src/lib/salic/text";

const COLUMNS: Array<[table: string, column: string]> = [
  ["Project", "name"],
  ["Payment", "itemName"],
  ["Payment", "documentNumber"],
  ["Payment", "justification"],
  ["Supplier", "name"],
];

async function main() {
  const apply = process.argv.includes("--apply");
  const url = (process.env.DATABASE_URL || "").replace(/[?&]schema=[^&]*/, "");
  if (!url) throw new Error("DATABASE_URL não definida");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(apply ? "BEGIN" : "BEGIN TRANSACTION READ ONLY");
    let total = 0;
    for (const [table, column] of COLUMNS) {
      const { rows } = await client.query<{ id: string; value: string }>(
        `select id, "${column}" as value from auditoria."${table}" where "${column}" ~ '[\\u0080-\\u009f]'`,
      );
      for (const row of rows) {
        const fixed = fixSalicEncoding(row.value);
        if (fixed === row.value) continue;
        total += 1;
        console.log(`${table}.${column} ${row.id}: ${JSON.stringify(row.value.slice(0, 80))} → ${JSON.stringify(fixed.slice(0, 80))}`);
        if (apply) {
          await client.query(`update auditoria."${table}" set "${column}" = $1 where id = $2`, [fixed, row.id]);
        }
      }
    }
    await client.query("COMMIT");
    console.log(`${apply ? "Corrigidos" : "A corrigir"}: ${total}`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
