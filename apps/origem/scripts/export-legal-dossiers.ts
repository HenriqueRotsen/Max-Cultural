/**
 * Exporta dossiês legais completos para disco (uso local one-shot).
 *
 * Uso:
 *   cd apps/origem
 *   npx tsx scripts/export-legal-dossiers.ts
 *   npx tsx scripts/export-legal-dossiers.ts --accountId=xxx
 *   npx tsx scripts/export-legal-dossiers.ts --out=./exports/dossiers
 *
 * Saída:
 *   {out}/{conta}/PRONAC_n_slug/   (pastas 01–05 + MANIFEST)
 *   {out}/{conta}/PRONAC_n_slug.zip
 *   {out}/{conta}/dossie-completo.zip
 */
import "dotenv/config";
import { config } from "dotenv";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { buildPronacDossier } from "@/lib/dossier/build";
import { createZipFromFiles } from "@/lib/dossier/zip";
import { pronacFolderSlug, slugifyName } from "@/lib/dossier/paths";

config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function exportAccount(params: {
  accountId: string;
  outRoot: string;
  skipRpa: boolean;
}) {
  const account = await prisma.salicAccount.findUnique({
    where: { id: params.accountId },
    include: {
      projects: { orderBy: { pronac: "asc" }, select: { id: true, pronac: true, name: true } },
    },
  });
  if (!account) throw new Error(`Conta não encontrada: ${params.accountId}`);

  const accountDir = path.join(
    params.outRoot,
    `${slugifyName(account.name)}_${account.cgccpf.replace(/\D/g, "").slice(-6)}`,
  );
  await mkdir(accountDir, { recursive: true });

  console.log(`\n=== ${account.name} (${account.projects.length} PRONAC(s)) ===`);
  console.log(`Pasta: ${accountDir}`);

  const zipEntries: Array<{ relativePath: string; buffer: Buffer }> = [];
  let idx = 0;

  for (const project of account.projects) {
    idx += 1;
    const slug = pronacFolderSlug(project.pronac, project.name);
    const folder = path.join(accountDir, slug);
    await rm(folder, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(folder, { recursive: true });

    console.log(`\n[${idx}/${account.projects.length}] PRONAC ${project.pronac} → ${slug}`);
    const started = Date.now();

    const built = await buildPronacDossier({
      workspaceId: account.workspaceId,
      accountId: account.id,
      projectId: project.id,
      jobId: `local-${account.id}-${project.id}`,
      outputDir: folder,
      rpa: params.skipRpa
        ? { enabled: false }
        : {
            enabled: true,
            // Local: baixar o máximo possível (há PRONACs com 2k+ anexos)
            maxFiles: 10_000,
            budgetMs: 6 * 60 * 60 * 1000,
          },
    });

    // Remove pasta auxiliar de compressão
    await rm(path.join(folder, "_compress"), { recursive: true, force: true }).catch(
      () => undefined,
    );

    const zipPath = path.join(accountDir, `${slug}.zip`);
    const { byteSize } = await createZipFromFiles({
      outPath: zipPath,
      files: built.artifacts.map((a) => ({
        relativePath: a.relativePath,
        buffer: a.buffer,
      })),
    });

    const zipBuf = await import("fs/promises").then((fs) => fs.readFile(zipPath));
    zipEntries.push({ relativePath: `${slug}.zip`, buffer: zipBuf });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `  OK · ${built.artifacts.length} arquivo(s) · ZIP ${(byteSize / 1024).toFixed(1)} KB · ${elapsed}s`,
    );
    if (built.limitations.length) {
      console.log(`  Avisos: ${built.limitations.length}`);
      for (const l of built.limitations.slice(0, 8)) console.log(`   - ${l}`);
      if (built.limitations.length > 8) {
        console.log(`   … +${built.limitations.length - 8} (ver README_LIMITACOES.txt)`);
      }
    }
  }

  if (zipEntries.length > 1) {
    const aggPath = path.join(accountDir, "dossie-completo.zip");
    const { byteSize } = await createZipFromFiles({ outPath: aggPath, files: zipEntries });
    console.log(
      `\nDossiê completo: ${aggPath} (${(byteSize / (1024 * 1024)).toFixed(2)} MB)`,
    );
  } else if (zipEntries.length === 1) {
    console.log(`\nZIP único: ${path.join(accountDir, zipEntries[0]!.relativePath)}`);
  }

  await writeFile(
    path.join(accountDir, "README_EXPORT.txt"),
    [
      `Max Origem — export local de dossiê`,
      `Conta: ${account.name}`,
      `CNPJ/CPF: ${account.cgccpf}`,
      `PRONACs: ${account.projects.length}`,
      `Gerado em: ${new Date().toISOString()}`,
      `RPA SALIC: ${params.skipRpa ? "desligado" : "ligado"}`,
      "",
      "Envie as pastas/ZIPs para o Google Drive.",
      "",
    ].join("\n"),
    "utf8",
  );

  return accountDir;
}

async function main() {
  const outRoot = path.resolve(arg("out") || path.join(process.cwd(), "exports", "dossiers"));
  const accountId = arg("accountId");
  const skipRpa = hasFlag("skip-rpa");

  await mkdir(outRoot, { recursive: true });
  console.log(`Saída: ${outRoot}`);
  if (skipRpa) console.log("RPA SALIC desligado (--skip-rpa)");

  const accounts = accountId
    ? await prisma.salicAccount.findMany({ where: { id: accountId } })
    : await prisma.salicAccount.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      });

  if (!accounts.length) {
    throw new Error(accountId ? "Conta não encontrada" : "Nenhuma conta ativa encontrada");
  }

  const dirs: string[] = [];
  for (const account of accounts) {
    const dir = await exportAccount({
      accountId: account.id,
      outRoot,
      skipRpa,
    });
    dirs.push(dir);
  }

  console.log("\n===== Concluído =====");
  for (const d of dirs) console.log(d);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
