/**
 * Dados demo para Postgres local do Indicadores (contexto → projeto → ação).
 * Uso: npx tsx scripts/seed-demo.ts
 */
import { config } from "dotenv";
// MAX_LOCAL_STACK=1 (npm run dev:local): o ambiente local já vem no processo.
if (process.env.MAX_LOCAL_STACK !== "1") config({ path: ".env.local", override: true });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada");
  if (!/localhost|127\.0\.0\.1/.test(connectionString)) {
    throw new Error(
      "seed-demo só roda contra banco local (localhost). Use npm run db:use-local primeiro.",
    );
  }

  const pool = new Pool({ connectionString });
  const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, schema ? { schema } : undefined),
  });

  try {
    const ctxArte = await prisma.contexto.upsert({
      where: { id: "demo-contexto-arte" },
      update: { nome: "Arte em Rede (demo)" },
      create: { id: "demo-contexto-arte", nome: "Arte em Rede (demo)" },
    });
    const ctxCultura = await prisma.contexto.upsert({
      where: { id: "demo-contexto-cultura" },
      update: { nome: "Cultura na Praça (demo)" },
      create: { id: "demo-contexto-cultura", nome: "Cultura na Praça (demo)" },
    });

    const proj1 = await prisma.projeto.upsert({
      where: { id: "demo-proj-240001" },
      update: {
        nome: "Arte em Rede — Edição Demo",
        pronac: "240001",
        proponente: "Instituto Demo Cultura",
        ano: "2026",
        contextoId: ctxArte.id,
      },
      create: {
        id: "demo-proj-240001",
        nome: "Arte em Rede — Edição Demo",
        pronac: "240001",
        proponente: "Instituto Demo Cultura",
        ano: "2026",
        contextoId: ctxArte.id,
      },
    });
    const proj2 = await prisma.projeto.upsert({
      where: { id: "demo-proj-250010" },
      update: {
        nome: "Mostra Cultural Demo",
        pronac: "250010",
        proponente: "Associação Demo",
        ano: "2026",
        contextoId: ctxCultura.id,
      },
      create: {
        id: "demo-proj-250010",
        nome: "Mostra Cultural Demo",
        pronac: "250010",
        proponente: "Associação Demo",
        ano: "2026",
        contextoId: ctxCultura.id,
      },
    });

    const of1 = await prisma.acao.upsert({
      where: { id: "demo-of-teatro" },
      update: { nome: "Oficina de Teatro", projetoId: proj1.id },
      create: {
        id: "demo-of-teatro",
        nome: "Oficina de Teatro",
        projetoId: proj1.id,
      },
    });
    const of2 = await prisma.acao.upsert({
      where: { id: "demo-of-musica" },
      update: { nome: "Oficina de Música", projetoId: proj1.id },
      create: {
        id: "demo-of-musica",
        nome: "Oficina de Música",
        projetoId: proj1.id,
      },
    });
    const of3 = await prisma.acao.upsert({
      where: { id: "demo-of-danca" },
      update: { nome: "Oficina de Dança", projetoId: proj2.id },
      create: {
        id: "demo-of-danca",
        nome: "Oficina de Dança",
        projetoId: proj2.id,
      },
    });

    // Territórios das ações (zona, cidade, UF): a agenda do acompanhamento usa estes.
    const territorios = [
      { id: "demo-ter-teatro-buritis", acaoId: of1.id, nome: "Buritis", cidade: "Belo Horizonte", estado: "MG", ordem: 0 },
      { id: "demo-ter-teatro-zonasul", acaoId: of1.id, nome: "Zona Sul", cidade: "Belo Horizonte", estado: "MG", ordem: 1 },
      { id: "demo-ter-musica-centro", acaoId: of2.id, nome: "Centro", cidade: "Januária", estado: "MG", ordem: 0 },
      { id: "demo-ter-danca-norte", acaoId: of3.id, nome: "Zona Norte", cidade: "Montes Claros", estado: "MG", ordem: 0 },
    ];
    for (const t of territorios) {
      await prisma.acaoTerritorio.upsert({ where: { id: t.id }, update: t, create: t });
    }
    await prisma.acao.update({ where: { id: of2.id }, data: { ofereceOnline: true } });

    const professor = await prisma.user.findUnique({
      where: { email: "professor@maxcultural.local" },
      select: { id: true },
    });
    if (professor) {
      await prisma.acaoResponsavel.upsert({
        where: {
          acaoId_userId: {
            acaoId: of1.id,
            userId: professor.id,
          },
        },
        update: {},
        create: { acaoId: of1.id, userId: professor.id },
      });
      console.log(`  Professor demo → ação ${of1.nome}`);
    }

    const muitas = await seedMuitasAcoes(prisma);

    console.log("Demo Indicadores OK:");
    console.log(`  ${muitas.contexto} → ${muitas.projeto} → ${muitas.acoes} ações, ${muitas.agenda} execuções`);
    console.log(`  ${ctxArte.nome} → ${proj1.nome} → ${of1.nome}, ${of2.nome}`);
    console.log(`  ${ctxCultura.nome} → ${proj2.nome} → ${of3.nome}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

/**
 * Projeto com ~150 ações (como os do Instituto Tatajuba), para testar o
 * Acompanhamento com muitas ações. Ids fixos: rodar de novo não duplica.
 */
async function seedMuitasAcoes(prisma: PrismaClient) {
  const N = 150;
  const contexto = await prisma.contexto.upsert({
    where: { id: "demo-contexto-muitas" },
    update: { nome: "Rede de Territórios (demo, 150 ações)" },
    create: { id: "demo-contexto-muitas", nome: "Rede de Territórios (demo, 150 ações)" },
  });
  const dadosProjeto = {
    nome: "Territórios Vivos — 150 ações (demo)",
    pronac: "260150",
    proponente: "Instituto Demo Territórios",
    ano: "2026",
    contextoId: contexto.id,
  };
  const projeto = await prisma.projeto.upsert({
    where: { id: "demo-proj-260150" },
    update: dadosProjeto,
    create: { id: "demo-proj-260150", ...dadosProjeto },
  });

  const tipos = ["oficina", "oficina", "oficina", "apresentacao", "curso", "palestra", "exposicao", "evento"];
  const temas = [
    "Teatro", "Música", "Dança", "Artesanato", "Audiovisual", "Fotografia", "Leitura", "Capoeira",
    "Percussão", "Grafite", "Circo", "Culinária", "Bordado", "Cerâmica", "Poesia",
  ];
  const nomeTipo: Record<string, string> = {
    oficina: "Oficina de",
    apresentacao: "Apresentação de",
    curso: "Curso de",
    palestra: "Roda de conversa sobre",
    exposicao: "Exposição de",
    evento: "Festival de",
  };
  const cidades = [
    ["Centro", "Fortaleza", "CE"], ["Barra do Ceará", "Fortaleza", "CE"], ["Sede", "Camocim", "CE"],
    ["Tatajuba", "Camocim", "CE"], ["Sede", "Jijoca de Jericoacoara", "CE"], ["Sede", "Cruz", "CE"],
    ["Sede", "Acaraú", "CE"], ["Sede", "Itarema", "CE"], ["Sede", "Granja", "CE"], ["Sede", "Sobral", "CE"],
  ] as const;

  const acoes = Array.from({ length: N }, (_, i) => {
    const tipoId = tipos[i % tipos.length]!;
    const tema = temas[i % temas.length]!;
    const turma = Math.floor(i / temas.length) + 1;
    return {
      id: `demo-muitas-acao-${String(i + 1).padStart(3, "0")}`,
      nome: `${nomeTipo[tipoId]} ${tema} ${turma}`,
      projetoId: projeto.id,
      tipoId,
      ofereceOnline: i % 9 === 0,
      oferecePresencial: true,
    };
  });
  await prisma.acao.createMany({ data: acoes, skipDuplicates: true });

  // 1 ou 2 territórios por ação; as 6 últimas ficam sem território (caso real a corrigir em Contextos).
  const territorios = acoes.flatMap((a, i) => {
    if (i >= N - 6) return [];
    const qtd = i % 4 === 0 ? 2 : 1;
    return Array.from({ length: qtd }, (_, k) => {
      const [nome, cidade, estado] = cidades[(i + k * 3) % cidades.length]!;
      return { id: `${a.id}-ter-${k}`, acaoId: a.id, nome, cidade, estado, ordem: k };
    });
  });
  await prisma.acaoTerritorio.createMany({ data: territorios, skipDuplicates: true });

  // Execuções: de 0 a 3 por ação, entre ago/2026 e mar/2027; ~1 em cada 7 fica sem datas.
  const base = Date.UTC(2026, 7, 3);
  const dia = 86_400_000;
  const agenda = acoes.flatMap((a, i) => {
    const ters = territorios.filter((t) => t.acaoId === a.id);
    if (!ters.length || i % 7 === 3) return [];
    const qtd = (i % 3) + 1;
    return Array.from({ length: qtd }, (_, k) => {
      const t = ters[k % ters.length]!;
      const inicio = new Date(base + ((i * 5 + k * 37) % 220) * dia);
      const fim = i % 5 === 0 ? new Date(inicio.getTime() + 2 * dia) : null;
      return {
        id: `${a.id}-ag-${k}`,
        acaoId: a.id,
        titulo: qtd > 1 ? `Turma ${k + 1}` : "",
        territorioId: t.id,
        online: false,
        cidade: t.cidade,
        uf: t.estado,
        data: inicio,
        dataFim: fim,
      };
    });
  });
  await prisma.acaoAgenda.createMany({ data: agenda, skipDuplicates: true });

  // Execução do projeto e recurso já liberado, para os prazos (e atrasos) aparecerem.
  await prisma.acompanhamentoProjeto.upsert({
    where: { projetoId: projeto.id },
    update: {},
    create: {
      projetoId: projeto.id,
      inicioExecucao: new Date(Date.UTC(2026, 6, 1)),
      fimExecucao: new Date(Date.UTC(2027, 5, 30)),
      recursoLiberadoEm: new Date(Date.UTC(2026, 6, 15)),
      recursoFonte: "GESTAO",
    },
  });

  return { contexto: contexto.nome, projeto: projeto.nome, acoes: acoes.length, agenda: agenda.length };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
