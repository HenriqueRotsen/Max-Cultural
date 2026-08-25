import { prisma } from "../lib/prisma";
import { resolveContextoForProjetoNome } from "../lib/hub/resolve-contexto";

/** Corrige projetos em contextos errados (stem divergente) e remove contextos órfãos. */
async function main() {
  const projetos = await prisma.projeto.findMany({
    include: { contexto: { select: { id: true, nome: true } } },
  });

  let moved = 0;
  for (const p of projetos) {
    const resolved = await resolveContextoForProjetoNome(p.nome);
    if (resolved.status !== "matched" || !resolved.contexto) continue;
    if (resolved.contexto.id === p.contextoId) continue;

    console.log(
      `Mover PRONAC ${p.pronac}: "${p.contexto.nome}" → "${resolved.contexto.nome}"`,
    );
    await prisma.projeto.update({
      where: { id: p.id },
      data: { contextoId: resolved.contexto.id },
    });
    await prisma.inscricao.updateMany({
      where: { idProjeto: p.id },
      data: {
        contextoId: resolved.contexto.id,
        nomeContexto: resolved.contexto.nome,
      },
    });
    moved++;
  }

  const contextos = await prisma.contexto.findMany({
    include: { _count: { select: { projetos: true } } },
  });
  let removed = 0;
  for (const c of contextos) {
    if (c._count.projetos > 0) continue;
    console.log(`Remover contexto vazio: "${c.nome}" (${c.id})`);
    await prisma.contexto.delete({ where: { id: c.id } });
    removed++;
  }

  console.log(`Concluído: ${moved} projeto(s) movido(s), ${removed} contexto(s) removido(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
