import "dotenv/config";
import { runSync } from "../src/lib/sync/run";

async function main() {
  const accountId = process.argv[2];
  const forceCrawler = process.argv.includes("--crawler");
  const result = await runSync({
    salicAccountId: accountId || undefined,
    forceCrawler,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
