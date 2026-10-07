/**
 * Dados demo para Postgres local do Fluxo (contexto → projeto → oficina).
 * Uso: npx tsx scripts/seed-demo.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });

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

    const of1 = await prisma.oficina.upsert({
      where: { id: "demo-of-teatro" },
      update: { nome: "Oficina de Teatro", projetoId: proj1.id },
      create: {
        id: "demo-of-teatro",
        nome: "Oficina de Teatro",
        projetoId: proj1.id,
      },
    });
    const of2 = await prisma.oficina.upsert({
      where: { id: "demo-of-musica" },
      update: { nome: "Oficina de Música", projetoId: proj1.id },
      create: {
        id: "demo-of-musica",
        nome: "Oficina de Música",
        projetoId: proj1.id,
      },
    });
    const of3 = await prisma.oficina.upsert({
      where: { id: "demo-of-danca" },
      update: { nome: "Oficina de Dança", projetoId: proj2.id },
      create: {
        id: "demo-of-danca",
        nome: "Oficina de Dança",
        projetoId: proj2.id,
      },
    });

    const professor = await prisma.user.findUnique({
      where: { email: "professor@maxcultural.local" },
      select: { id: true },
    });
    if (professor) {
      await prisma.oficinaProfessor.upsert({
        where: {
          oficinaId_userId: {
            oficinaId: of1.id,
            userId: professor.id,
          },
        },
        update: {},
        create: { oficinaId: of1.id, userId: professor.id },
      });
      console.log(`  Professor demo → oficina ${of1.nome}`);
    }

    console.log("Demo Fluxo OK:");
    console.log(`  ${ctxArte.nome} → ${proj1.nome} → ${of1.nome}, ${of2.nome}`);
    console.log(`  ${ctxCultura.nome} → ${proj2.nome} → ${of3.nome}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
