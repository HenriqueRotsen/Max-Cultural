/**
 * Reimporta planilhas (readequada → homologada), captação e salicComprovado
 * para projetos federais em andamento.
 *
 * Uso:
 *   npx tsx scripts/reimport-planning-sheets.ts
 *   npx tsx scripts/reimport-planning-sheets.ts 201592 211661
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { prisma } from "../src/lib/db";
import { refreshPlanningSheetsForWorkspace } from "../src/lib/planning/federal/sync-sheet";
import { syncCaptacaoForWorkspace } from "../src/lib/planning/federal/captacao-salic";

async function main() {
  const onlyPronacs = process.argv.slice(2).filter((a) => !a.startsWith("-"));

  const workspace = await prisma.workspace.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!workspace) throw new Error("Nenhum workspace encontrado");

  console.log(
    `Workspace ${workspace.name || workspace.id}` +
      (onlyPronacs.length ? ` · PRONACs: ${onlyPronacs.join(", ")}` : " · todos EM_ANDAMENTO"),
  );

  const sheets = await refreshPlanningSheetsForWorkspace(
    workspace.id,
    undefined,
    onlyPronacs.length ? { onlyPronacs } : undefined,
  );
  console.log(
    JSON.stringify(
      {
        refreshed: sheets.refreshed,
        created: sheets.created,
        skipped: sheets.skipped,
        errors: sheets.errors,
      },
      null,
      2,
    ),
  );

  const captacao = await syncCaptacaoForWorkspace(workspace.id);
  console.log(
    JSON.stringify(
      {
        captacaoSynced: captacao.synced,
        captacaoSkipped: captacao.skipped,
        captacaoErrors: captacao.errors,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
