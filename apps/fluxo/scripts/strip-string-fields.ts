/**
 * Normaliza strings existentes no banco (trim + pipeline de normalizeRow).
 * Uso: npm run strip:string-fields -w max-fluxo
 */
import { prisma } from "../lib/prisma";
import { normalizeRow } from "../lib/normalize";
import { prismaToRow, rowToPrisma } from "../lib/schema";

const BATCH = 200;

function trim(value: string | null | undefined) {
  return (value ?? "").trim();
}

async function stripInscricoes(dryRun: boolean) {
  let scanned = 0;
  let updated = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.inscricao.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    for (const record of rows) {
      scanned++;
      const before = prismaToRow(record);
      const next = normalizeRow(before);
      const data = rowToPrisma(next, {
        contextoId: record.contextoId ?? undefined,
        nomeContexto: trim(record.nomeContexto),
      });

      const changed = Object.keys(data).some((key) => {
        const k = key as keyof typeof data;
        const prev = (record as Record<string, unknown>)[k];
        return prev !== data[k];
      });

      if (!changed) continue;
      updated++;
      if (!dryRun) {
        await prisma.inscricao.update({
          where: { id: record.id },
          data,
        });
      }
    }

    process.stdout.write(`\rInscrições: ${scanned} lidas, ${updated} alteradas`);
  }

  console.log("");
  return { scanned, updated };
}

async function stripHierarchy(dryRun: boolean) {
  let updated = 0;

  for (const c of await prisma.contexto.findMany()) {
    const nome = trim(c.nome);
    if (nome !== c.nome) {
      updated++;
      if (!dryRun) {
        await prisma.contexto.update({ where: { id: c.id }, data: { nome } });
        await prisma.inscricao.updateMany({
          where: { contextoId: c.id },
          data: { nomeContexto: nome },
        });
      }
    }
  }

  for (const p of await prisma.projeto.findMany()) {
    const data = {
      nome: trim(p.nome),
      pronac: trim(p.pronac),
      proponente: trim(p.proponente),
      ano: trim(p.ano),
    };
    if (
      data.nome === p.nome &&
      data.pronac === p.pronac &&
      data.proponente === p.proponente &&
      data.ano === p.ano
    ) {
      continue;
    }
    updated++;
    if (!dryRun) {
      const updatedProj = await prisma.projeto.update({
        where: { id: p.id },
        data,
        include: { contexto: { select: { nome: true } } },
      });
      await prisma.inscricao.updateMany({
        where: { idProjeto: p.id },
        data: {
          nomeProjeto: updatedProj.nome,
          pronac: updatedProj.pronac,
          proponente: updatedProj.proponente,
          identificacaoAnoProjeto: updatedProj.ano,
        },
      });
    }
  }

  for (const o of await prisma.oficina.findMany()) {
    const nome = trim(o.nome);
    if (nome === o.nome) continue;
    updated++;
    if (!dryRun) {
      await prisma.oficina.update({ where: { id: o.id }, data: { nome } });
      await prisma.inscricao.updateMany({
        where: { idOficina: o.id },
        data: { nomeOficina: nome },
      });
    }
  }

  console.log(`Hierarquia: ${updated} registro(s) alterado(s)`);
  return updated;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "Modo dry-run (sem gravar)\n" : "Gravando alterações…\n");

  const insc = await stripInscricoes(dryRun);
  const hierarchy = await stripHierarchy(dryRun);

  console.log(
    `\nConcluído: ${insc.updated}/${insc.scanned} inscrições, ${hierarchy} hierarquia.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
