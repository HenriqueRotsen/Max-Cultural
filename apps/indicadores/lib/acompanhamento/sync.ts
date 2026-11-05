import { prisma } from "@/lib/prisma";
import {
  chaveTarefa,
  gerarTarefas,
  type ModeloTarefa,
} from "@/lib/acompanhamento/regras";
import { buscarProjetoFinanceiro, recursoFoiLiberado } from "@/lib/acompanhamento/financeiro";

/** Garante a linha de acompanhamento do projeto e detecta o "recurso liberado". */
export async function garantirAcompanhamento(projetoId: string) {
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: { id: true, pronac: true },
  });
  if (!projeto) return null;
  let acomp = await prisma.acompanhamentoProjeto.upsert({
    where: { projetoId },
    create: { projetoId },
    update: {},
  });
  if (!acomp.recursoLiberadoEm) {
    const fin = await buscarProjetoFinanceiro(projeto.pronac);
    if (fin && (recursoFoiLiberado(fin) || fin.id !== acomp.financeiroProjectId)) {
      acomp = await prisma.acompanhamentoProjeto.update({
        where: { projetoId },
        data: {
          financeiroProjectId: fin.id,
          // Data da detecção (o Financeiro não guarda a data da transferência).
          ...(recursoFoiLiberado(fin) ? { recursoLiberadoEm: new Date() } : {}),
        },
      });
    }
  }
  return acomp;
}

/**
 * Cria as tarefas que faltam (a partir dos modelos ativos) e recalcula o prazo
 * das tarefas geradas. Tarefas de cidade ou de ação que deixaram de existir
 * (ex.: o marcador "ação sem data" depois que a ação ganha agenda) são removidas
 * só se ninguém mexeu nelas (não iniciada e sem comentários).
 */
export async function sincronizarTarefas(projetoId: string) {
  // Uma sincronização por projeto de cada vez (duas abas abertas não duplicam tarefas).
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"acompanhamento:" + projetoId}))`;
      const [acomp, modelos, acoes, existentes] = await Promise.all([
        tx.acompanhamentoProjeto.findUnique({ where: { projetoId } }),
        tx.tarefaModelo.findMany({ where: { ativo: true } }),
        tx.acao.findMany({
          where: { projetoId },
          select: { id: true, tipoId: true, agenda: { select: { id: true, cidade: true, uf: true, data: true } } },
        }),
        tx.tarefa.findMany({
          where: { projetoId },
          select: {
            id: true,
            modeloId: true,
            unidade: true,
            acaoId: true,
            agendaId: true,
            cidade: true,
            uf: true,
            prazo: true,
            prazoManual: true,
            status: true,
            _count: { select: { comentarios: true } },
          },
        }),
      ]);

      const geradas = gerarTarefas({
        modelos: modelos as unknown as ModeloTarefa[],
        datas: { inicioExecucao: acomp?.inicioExecucao ?? null, fimExecucao: acomp?.fimExecucao ?? null },
        acoes,
      });
      const porChave = new Map(existentes.map((t) => [chaveTarefa(t), t]));
      const chavesGeradas = new Set(geradas.map(chaveTarefa));

      const novas = geradas.filter((g) => !porChave.has(chaveTarefa(g)));
      if (novas.length) {
        await tx.tarefa.createMany({
          data: novas.map((g) => ({ projetoId, ...g })),
        });
      }

      const mudarPrazo = geradas
        .map((g) => ({ g, t: porChave.get(chaveTarefa(g)) }))
        .filter(({ g, t }) => t && !t.prazoManual && (t.prazo?.getTime() ?? null) !== (g.prazo?.getTime() ?? null));
      for (const { g, t } of mudarPrazo) {
        await tx.tarefa.update({ where: { id: t!.id }, data: { prazo: g.prazo } });
      }

      const orfas = existentes.filter(
        (t) =>
          t.modeloId &&
          t.unidade !== "PROJETO" &&
          !chavesGeradas.has(chaveTarefa(t)) &&
          t.status === "NAO_INICIADA" &&
          t._count.comentarios === 0,
      );
      if (orfas.length) {
        await tx.tarefa.deleteMany({ where: { id: { in: orfas.map((t) => t.id) } } });
      }

      return { criadas: novas.length, prazosAtualizados: mudarPrazo.length, removidas: orfas.length };
    },
    { timeout: 20_000 },
  );
}
