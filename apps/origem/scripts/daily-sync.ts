/**
 * Sync diário de todas as contas (uso local / crontab).
 *
 * Crontab (10:00 America/Sao_Paulo — horário comercial):
 *   0 10 * * * cd /caminho/Salink && set -a && . ./.env && set +a && /usr/bin/npx tsx scripts/daily-sync.ts >> /tmp/salink-cron.log 2>&1
 *
 * Ou via HTTP (servidor no ar):
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-sync
 */
import { config } from "dotenv";
config({ path: ".env" });

import { prisma } from "../src/lib/db";
import { runDailySyncAllAccounts } from "../src/lib/sync/daily";

async function main() {
  const running = await prisma.syncRun.findFirst({
    where: { status: { in: ["pending", "running"] } },
  });
  if (running) {
    console.log(
      JSON.stringify({
        skipped: true,
        reason: "Já existe sincronização em andamento",
        syncRunId: running.id,
      }),
    );
    process.exit(0);
  }

  console.log(`[salink-cron] iniciando sync diário ${new Date().toISOString()}`);
  const result = await runDailySyncAllAccounts();
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
