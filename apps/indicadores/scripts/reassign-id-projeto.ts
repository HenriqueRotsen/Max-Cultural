/**
 * @deprecated IDs agora vivem em projetos/oficinas. Mantido só para histórico.
 * // @ts-nocheck
 */
// @ts-nocheck
/**
 * Reatribui id_projeto sequencial (1..N). Não altera id_oficina.
 * Uso: npx tsx scripts/reassign-id-projeto.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";

async function main() {
  const [inscGroups, contextos] = await Promise.all([
    prisma.inscricao.groupBy({
      by: ["idProjeto"],
      _min: { createdAt: true },
      _max: { nomeProjeto: true },
    }),
    prisma.contextoLote.findMany({
      select: {
        id: true,
        idProjeto: true,
        nomeProjeto: true,
        createdAt: true,
      },
    }),
  ]);

  type Entry = { oldId: string; nome: string; sortAt: Date };
  const byOld = new Map<string, Entry>();

  for (const g of inscGroups) {
    const oldId = g.idProjeto.trim();
    if (!oldId) continue;
    byOld.set(oldId, {
      oldId,
      nome: g._max.nomeProjeto || oldId,
      sortAt: g._min.createdAt ?? new Date(0),
    });
  }
  for (const c of contextos) {
    const oldId = c.idProjeto.trim();
    if (!oldId) continue;
    const prev = byOld.get(oldId);
    if (!prev) {
      byOld.set(oldId, {
        oldId,
        nome: c.nomeProjeto || oldId,
        sortAt: c.createdAt,
      });
    } else if (c.createdAt < prev.sortAt) {
      prev.sortAt = c.createdAt;
    }
  }

  const ordered = [...byOld.values()].sort((a, b) => {
    const t = a.sortAt.getTime() - b.sortAt.getTime();
    if (t !== 0) return t;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  const map = new Map<string, string>();
  ordered.forEach((e, i) => {
    map.set(e.oldId, String(i + 1));
  });

  console.log(`Projetos distintos: ${map.size}`);

  // Two-phase to avoid unique collisions if any: temp prefix then final
  let phase1 = 0;
  for (const [oldId, newId] of map) {
    if (oldId === newId) continue;
    const temp = `__tmp_${newId}`;
    const r1 = await prisma.inscricao.updateMany({
      where: { idProjeto: oldId },
      data: { idProjeto: temp },
    });
    const r2 = await prisma.contextoLote.updateMany({
      where: { idProjeto: oldId },
      data: { idProjeto: temp },
    });
    phase1 += r1.count + r2.count;
  }

  let phase2 = 0;
  for (const [, newId] of map) {
    const temp = `__tmp_${newId}`;
    const r1 = await prisma.inscricao.updateMany({
      where: { idProjeto: temp },
      data: { idProjeto: newId },
    });
    const r2 = await prisma.contextoLote.updateMany({
      where: { idProjeto: temp },
      data: { idProjeto: newId },
    });
    phase2 += r1.count + r2.count;
  }

  console.log(`Fase temp: ${phase1} linhas; fase final: ${phase2} linhas.`);
  for (const [oldId, newId] of [...map.entries()].slice(0, 15)) {
    console.log(`  ${oldId} → ${newId}`);
  }
  if (map.size > 15) console.log(`  … +${map.size - 15} projetos`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
