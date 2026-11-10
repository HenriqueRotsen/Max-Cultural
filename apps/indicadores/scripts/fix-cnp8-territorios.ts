/**
 * Padroniza territórios da ação Cultura na Praça 8 (Ações de Cinema).
 * Uso: npx tsx scripts/fix-cnp8-territorios.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { enrichCidadeEstado } from "../lib/municipio-uf";
import { normalizeTerritorioRawKey } from "../lib/acao-territorio";

const ACAO_ID = "62";

async function main() {
  const acao = await prisma.acao.findUnique({
    where: { id: ACAO_ID },
    include: {
      projeto: { select: { nome: true, pronac: true } },
      territorios: true,
    },
  });
  if (!acao) {
    throw new Error(`Ação ${ACAO_ID} não encontrada`);
  }

  const rows = await prisma.inscricao.findMany({
    where: { idAcao: ACAO_ID },
    select: {
      id: true,
      cidade: true,
      estado: true,
      territorio: true,
    },
  });

  const nextById = new Map<
    string,
    { cidade: string; estado: string; territorio: string }
  >();
  const locations = new Map<
    string,
    { cidade: string; estado: string; nome: string }
  >();
  const aliasRaw = new Map<string, string>();

  for (const row of rows) {
    const next = enrichCidadeEstado({
      cidade: row.cidade,
      estado: row.estado,
      territorio: row.territorio,
    });
    nextById.set(row.id, next);
    if (next.cidade && next.estado) {
      const key = `${normalizeTerritorioRawKey(next.cidade)}|${next.estado}|${normalizeTerritorioRawKey(next.territorio)}`;
      if (!locations.has(key)) {
        locations.set(key, {
          cidade: next.cidade,
          estado: next.estado,
          nome: next.territorio,
        });
      }
    }
    const rawKey = normalizeTerritorioRawKey(row.territorio);
    if (rawKey && next.cidade) {
      aliasRaw.set(rawKey, `${next.cidade}|${next.estado}|${next.territorio}`);
    }
  }

  console.log(
    `${acao.projeto.nome} · ${acao.nome} · ${rows.length} inscrições`,
  );
  console.log("locais", [...locations.values()]);

  await prisma.acao.update({
    where: { id: ACAO_ID },
    data: { ofereceOnline: false, oferecePresencial: true },
  });

  await prisma.acaoTerritorioAlias.deleteMany({
    where: { acaoId: ACAO_ID },
  });
  await prisma.acaoTerritorio.deleteMany({
    where: { acaoId: ACAO_ID },
  });

  const created = [];
  let ordem = 0;
  for (const loc of locations.values()) {
    const rec = await prisma.acaoTerritorio.create({
      data: {
        acaoId: ACAO_ID,
        nome: loc.nome,
        cidade: loc.cidade,
        estado: loc.estado,
        ordem: ordem++,
      },
    });
    created.push(rec);
  }

  const locIdByKey = new Map(
    created.map((t) => [
      `${normalizeTerritorioRawKey(t.cidade)}|${t.estado}|${normalizeTerritorioRawKey(t.nome)}`,
      t.id,
    ]),
  );

  for (const [rawNormalized, locKey] of aliasRaw) {
    const [cidade, estado, nome] = locKey.split("|");
    const acaoTerritorioId =
      locIdByKey.get(
        `${normalizeTerritorioRawKey(cidade)}|${estado}|${normalizeTerritorioRawKey(nome)}`,
      ) ?? null;
    await prisma.acaoTerritorioAlias.create({
      data: {
        acaoId: ACAO_ID,
        rawNormalized,
        online: false,
        acaoTerritorioId,
        cidade: cidade ?? "",
        estado: estado ?? "",
        territorio: nome ?? "",
      },
    });
  }

  let updated = 0;
  for (const row of rows) {
    const next = nextById.get(row.id)!;
    if (
      next.cidade === row.cidade &&
      next.estado === row.estado &&
      next.territorio === row.territorio
    ) {
      continue;
    }
    await prisma.inscricao.update({
      where: { id: row.id },
      data: {
        cidade: next.cidade,
        estado: next.estado,
        territorio: next.territorio,
      },
    });
    updated += 1;
  }

  console.log(
    `Catálogo: ${created.length} território(s). Aliases: ${aliasRaw.size}. Inscrições atualizadas: ${updated}.`,
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
