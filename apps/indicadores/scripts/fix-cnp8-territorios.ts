/**
 * Padroniza territórios da oficina Cultura na Praça 8 (Oficinas de Cinema).
 * Uso: npx tsx scripts/fix-cnp8-territorios.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { enrichCidadeEstado } from "../lib/municipio-uf";
import { normalizeTerritorioRawKey } from "../lib/oficina-territorio";

const OFICINA_ID = "62";

async function main() {
  const oficina = await prisma.oficina.findUnique({
    where: { id: OFICINA_ID },
    include: {
      projeto: { select: { nome: true, pronac: true } },
      territorios: true,
    },
  });
  if (!oficina) {
    throw new Error(`Oficina ${OFICINA_ID} não encontrada`);
  }

  const rows = await prisma.inscricao.findMany({
    where: { idOficina: OFICINA_ID },
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
    `${oficina.projeto.nome} · ${oficina.nome} · ${rows.length} inscrições`,
  );
  console.log("locais", [...locations.values()]);

  await prisma.oficina.update({
    where: { id: OFICINA_ID },
    data: { ofereceOnline: false, oferecePresencial: true },
  });

  await prisma.oficinaTerritorioAlias.deleteMany({
    where: { oficinaId: OFICINA_ID },
  });
  await prisma.oficinaTerritorio.deleteMany({
    where: { oficinaId: OFICINA_ID },
  });

  const created = [];
  let ordem = 0;
  for (const loc of locations.values()) {
    const rec = await prisma.oficinaTerritorio.create({
      data: {
        oficinaId: OFICINA_ID,
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
    const oficinaTerritorioId =
      locIdByKey.get(
        `${normalizeTerritorioRawKey(cidade)}|${estado}|${normalizeTerritorioRawKey(nome)}`,
      ) ?? null;
    await prisma.oficinaTerritorioAlias.create({
      data: {
        oficinaId: OFICINA_ID,
        rawNormalized,
        online: false,
        oficinaTerritorioId,
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
