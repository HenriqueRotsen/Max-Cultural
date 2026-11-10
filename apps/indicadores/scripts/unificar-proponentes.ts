/**
 * Une grafias do mesmo proponente em projetos e inscrições
 * ("Vivas Cultura e Esporte" → "Vivas Cultura e Esporte LTDA",
 * "Instituto Vivas" → "Instituto Morada Vivas"). Regras em lib/proponente.ts.
 *
 * Por padrão só mostra o que faria (dry-run). Com --aplicar, grava e salva antes
 * um backup JSON (id, nome antigo, nome novo) para desfazer.
 *
 *   Local:     npm run dev -- run indicadores npx tsx scripts/unificar-proponentes.ts [--aplicar]
 *   Produção:  npm run indicadores:unificar-proponentes:producao [-- --aplicar]   (só com autorização)
 *
 * Nomes de teste ("Teste", "Demo"…) não são tocados: aparecem na lista para conferência.
 * Pares parecidos que as regras não juntam aparecem como "possíveis duplicados";
 * para juntar, inclua o par em PROPONENTE_APELIDOS (lib/proponente.ts) e rode de novo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../lib/prisma";
import { agruparProponentes, possiveisDuplicados } from "../lib/proponente";

const aplicar = process.argv.includes("--aplicar");

async function main() {
  const [projetos, inscricoes] = await Promise.all([
    prisma.projeto.groupBy({ by: ["proponente"], _count: { _all: true } }),
    prisma.inscricao.groupBy({ by: ["proponente"], _count: { _all: true } }),
  ]);
  const usos = new Map<string, { projetos: number; inscricoes: number }>();
  for (const g of projetos) {
    const u = usos.get(g.proponente) ?? { projetos: 0, inscricoes: 0 };
    u.projetos += g._count._all;
    usos.set(g.proponente, u);
  }
  for (const g of inscricoes) {
    const u = usos.get(g.proponente) ?? { projetos: 0, inscricoes: 0 };
    u.inscricoes += g._count._all;
    usos.set(g.proponente, u);
  }

  const { grupos, teste } = agruparProponentes(
    [...usos.entries()].map(([nome, u]) => ({ nome, usos: u.projetos + u.inscricoes })),
  );
  const fmt = (nome: string) => {
    const u = usos.get(nome) ?? { projetos: 0, inscricoes: 0 };
    return `"${nome}" (${u.projetos} projeto(s), ${u.inscricoes} inscrição(ões))`;
  };

  // Também acerta espaços sobrando num nome sem outra grafia.
  const trocas = grupos.flatMap((g) =>
    g.variantes.filter((v) => v.nome !== g.nome).map((v) => ({ de: v.nome, para: g.nome })),
  );

  console.log(`\n${aplicar ? "APLICANDO" : "DRY-RUN (nada é gravado; use --aplicar)"}`);
  console.log(`${usos.size} grafia(s) de proponente, ${grupos.length} proponente(s) depois de unir.\n`);

  const unidos = grupos.filter((g) => g.variantes.some((v) => v.nome !== g.nome));
  if (!unidos.length) console.log("Nada a unir.");
  for (const g of unidos) {
    console.log(`• Fica: ${fmt(g.nome)}`);
    for (const v of g.variantes.filter((x) => x.nome !== g.nome)) console.log(`    ← ${fmt(v.nome)}`);
  }

  if (teste.length) {
    console.log("\nDados de teste (não alterados):");
    for (const t of teste) console.log(`  - ${fmt(t.nome)}`);
  }

  const possiveis = possiveisDuplicados(grupos);
  if (possiveis.length) {
    console.log("\nPossíveis duplicados (NÃO unidos; conferir e, se for o caso, incluir em PROPONENTE_APELIDOS):");
    for (const [a, b] of possiveis) console.log(`  ? "${a}"  ×  "${b}"`);
  }

  if (!aplicar || !trocas.length) {
    await prisma.$disconnect();
    return;
  }

  const de = trocas.map((t) => t.de);
  const [projetosAfetados, inscricoesAfetadas] = await Promise.all([
    prisma.projeto.findMany({ where: { proponente: { in: de } }, select: { id: true, proponente: true } }),
    prisma.inscricao.findMany({ where: { proponente: { in: de } }, select: { id: true, proponente: true } }),
  ]);
  const para = new Map(trocas.map((t) => [t.de, t.para]));
  const dir = resolve(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const arquivo = resolve(dir, `unificar-proponentes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    arquivo,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        projetos: projetosAfetados.map((p) => ({ id: p.id, de: p.proponente, para: para.get(p.proponente) })),
        inscricoes: inscricoesAfetadas.map((i) => ({ id: i.id, de: i.proponente, para: para.get(i.proponente) })),
      },
      null,
      2,
    ),
  );
  console.log(`\nBackup: ${arquivo}`);

  const resultado = await prisma.$transaction(
    trocas.flatMap((t) => [
      prisma.projeto.updateMany({ where: { proponente: t.de }, data: { proponente: t.para } }),
      prisma.inscricao.updateMany({ where: { proponente: t.de }, data: { proponente: t.para } }),
    ]),
  );
  const total = (i: number) =>
    resultado.filter((_, k) => k % 2 === i).reduce((s, r) => s + r.count, 0);
  console.log(`✅ ${total(0)} projeto(s) e ${total(1)} inscrição(ões) atualizados.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
