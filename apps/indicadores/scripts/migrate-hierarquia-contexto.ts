/**
 * Migra inscrições para hierarquia Contexto → Projeto → Ação.
 * Uso: npx tsx scripts/migrate-hierarquia-contexto.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { extractProjectYear } from "../lib/normalize";
import { programaStem, programaDisplayName } from "../lib/programa";

function normKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main() {
  // Limpa hierarquia se reexecutar
  await prisma.acao.deleteMany();
  await prisma.projeto.deleteMany();
  await prisma.contexto.deleteMany();

  const rows = await prisma.inscricao.findMany({
    select: {
      id: true,
      idProjeto: true,
      idAcao: true,
      nomeProjeto: true,
      nomeAcao: true,
      pronac: true,
      proponente: true,
      identificacaoAnoProjeto: true,
    },
  });

  console.log(`Inscrições: ${rows.length}`);

  // stem → contexto nome
  type ProjKey = string; // nomeProjeto|pronac
  type OficKey = string; // nomeAcao (within project)

  const stemToCtxNome = new Map<string, string>();
  const stemProjects = new Map<
    string,
    Map<
      ProjKey,
      {
        nome: string;
        pronac: string;
        proponente: string;
        ano: string;
        acoes: Map<OficKey, { nome: string; oldIds: Set<string> }>;
      }
    >
  >();

  for (const r of rows) {
    const stem = programaStem(r.nomeProjeto) || "sem-programa";
    if (!stemToCtxNome.has(stem)) {
      stemToCtxNome.set(stem, programaDisplayName(r.nomeProjeto));
    }
    let projects = stemProjects.get(stem);
    if (!projects) {
      projects = new Map();
      stemProjects.set(stem, projects);
    }
    const pKey = `${normKey(r.nomeProjeto)}|${normKey(r.pronac)}`;
    let proj = projects.get(pKey);
    if (!proj) {
      proj = {
        nome: r.nomeProjeto.trim() || "Projeto",
        pronac: r.pronac.trim() || "—",
        proponente: r.proponente.trim(),
        ano:
          extractProjectYear(r.identificacaoAnoProjeto) ||
          r.identificacaoAnoProjeto.trim(),
        acoes: new Map(),
      };
      projects.set(pKey, proj);
    }
    if (!proj.proponente && r.proponente.trim()) {
      proj.proponente = r.proponente.trim();
    }
    const oNome = r.nomeAcao.trim() || r.idAcao || "Ação";
    const oKey = normKey(oNome);
    let of = proj.acoes.get(oKey);
    if (!of) {
      of = { nome: oNome, oldIds: new Set() };
      proj.acoes.set(oKey, of);
    }
    of.oldIds.add(r.idAcao);
  }

  // Create entities + mapping old → new for inscription updates
  // Map: old (idProjeto|idAcao|nomeProjeto|pronac) is messy; map by inscription fields
  type Mapping = {
    contextoId: string;
    nomeContexto: string;
    idProjeto: string;
    nomeProjeto: string;
    pronac: string;
    proponente: string;
    ano: string;
    idAcao: string;
    nomeAcao: string;
  };

  // key: stem|nomeProjeto|pronac|nomeAcao
  const mapByKeys = new Map<string, Mapping>();

  let nextProj = 1;
  let nextOfic = 1;

  for (const [stem, projects] of [...stemProjects.entries()].sort((a, b) =>
    (stemToCtxNome.get(a[0]) || a[0]).localeCompare(
      stemToCtxNome.get(b[0]) || b[0],
      "pt-BR",
    ),
  )) {
    const ctxNome = stemToCtxNome.get(stem) || stem;
    const ctx = await prisma.contexto.create({
      data: { nome: ctxNome },
    });
    console.log(`Contexto: ${ctxNome} (${projects.size} projeto(s))`);

    for (const [, proj] of projects) {
      const idProjeto = String(nextProj++);
      await prisma.projeto.create({
        data: {
          id: idProjeto,
          nome: proj.nome,
          pronac: proj.pronac,
          proponente: proj.proponente,
          ano: proj.ano,
          contextoId: ctx.id,
        },
      });

      for (const [, of] of proj.acoes) {
        const idAcao = String(nextOfic++);
        await prisma.acao.create({
          data: {
            id: idAcao,
            nome: of.nome,
            projetoId: idProjeto,
          },
        });
        const key = `${stem}|${normKey(proj.nome)}|${normKey(proj.pronac)}|${normKey(of.nome)}`;
        mapByKeys.set(key, {
          contextoId: ctx.id,
          nomeContexto: ctxNome,
          idProjeto,
          nomeProjeto: proj.nome,
          pronac: proj.pronac,
          proponente: proj.proponente,
          ano: proj.ano,
          idAcao,
          nomeAcao: of.nome,
        });
      }
    }
  }

  console.log(`Projetos: ${nextProj - 1}, Ações: ${nextOfic - 1}`);

  // Update inscriptions in batches
  let updated = 0;
  let missing = 0;
  const CONCURRENCY = 40;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (r) => {
        const stem = programaStem(r.nomeProjeto) || "sem-programa";
        const oNome = r.nomeAcao.trim() || r.idAcao || "Ação";
        const key = `${stem}|${normKey(r.nomeProjeto)}|${normKey(r.pronac)}|${normKey(oNome)}`;
        const m = mapByKeys.get(key);
        if (!m) {
          missing += 1;
          return;
        }
        await prisma.inscricao.update({
          where: { id: r.id },
          data: {
            contextoId: m.contextoId,
            nomeContexto: m.nomeContexto,
            idProjeto: m.idProjeto,
            idAcao: m.idAcao,
            nomeProjeto: m.nomeProjeto,
            nomeAcao: m.nomeAcao,
            pronac: m.pronac,
            proponente: m.proponente || r.proponente,
            identificacaoAnoProjeto: m.ano || r.identificacaoAnoProjeto,
          },
        });
        updated += 1;
      }),
    );
    if ((i + CONCURRENCY) % 400 === 0 || i + CONCURRENCY >= rows.length) {
      console.log(`  inscricoes ${Math.min(i + CONCURRENCY, rows.length)}/${rows.length}`);
    }
  }

  console.log(`Atualizadas: ${updated}, sem mapeamento: ${missing}`);

  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "contextos_lote"`);
    console.log("Tabela contextos_lote removida (se existia).");
  } catch (err) {
    console.warn("Não foi possível dropar contextos_lote:", err);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
