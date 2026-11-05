import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  chaveTarefa,
  gerarTarefas,
  type ModeloTarefa,
} from "@/lib/acompanhamento/regras";
import {
  buscarProjetoFinanceiro,
  buscarProjetoFinanceiroPorId,
  recursoFoiLiberado,
} from "@/lib/acompanhamento/financeiro";

const CAMPOS_MODELO = {
  id: true,
  area: true,
  nivel: true,
  fase: true,
  titulo: true,
  detalhamento: true,
  unidade: true,
  prazoBase: true,
  prazoDias: true,
  tiposAcao: true,
  ordem: true,
  ativo: true,
} as const;

/** Cópia da pré-definição atual (modelos ativos), guardada no projeto. */
export async function copiaDaPreDefinicao(): Promise<Prisma.InputJsonValue> {
  const modelos: ModeloTarefa[] = await prisma.tarefaModelo.findMany({
    where: { ativo: true },
    orderBy: [{ area: "asc" }, { nivel: "asc" }, { ordem: "asc" }],
    select: CAMPOS_MODELO,
  });
  return modelos as unknown as Prisma.InputJsonValue;
}

/**
 * Garante a linha de acompanhamento do projeto, guarda a pré-definição do dia
 * (mudanças posteriores só valem para projetos novos) e verifica o recurso.
 */
export async function garantirAcompanhamento(projetoId: string) {
  const projeto = await prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true } });
  if (!projeto) return null;
  let acomp = await prisma.acompanhamentoProjeto.upsert({
    where: { projetoId },
    create: { projetoId, modelos: await copiaDaPreDefinicao(), modelosEm: new Date() },
    update: {},
  });
  if (!acomp.modelos) {
    acomp = await prisma.acompanhamentoProjeto.update({
      where: { projetoId },
      data: { modelos: await copiaDaPreDefinicao(), modelosEm: new Date() },
    });
  }
  return (await verificarRecurso(projetoId)) ?? acomp;
}

/**
 * "Recurso liberado": vem do projeto do MAX Financeiro ligado a este — pelo
 * PRONAC (federal) ou escolhido pela gestão (outras leis). Liberado quando o
 * Financeiro já tem valor transferido para a conta de movimentação. Data
 * informada pela gestão nunca é trocada.
 */
export async function verificarRecurso(projetoId: string) {
  const [projeto, acomp] = await Promise.all([
    prisma.projeto.findUnique({ where: { id: projetoId }, select: { pronac: true } }),
    prisma.acompanhamentoProjeto.findUnique({ where: { projetoId } }),
  ]);
  if (!projeto || !acomp || acomp.recursoLiberadoEm) return acomp;
  const fin = acomp.financeiroProjectId
    ? await buscarProjetoFinanceiroPorId(acomp.financeiroProjectId)
    : acomp.financeiroManual
      ? null
      : await buscarProjetoFinanceiro(projeto.pronac);
  if (!fin) return acomp;
  const liberado = recursoFoiLiberado(fin);
  if (!liberado && fin.id === acomp.financeiroProjectId) return acomp;
  return prisma.acompanhamentoProjeto.update({
    where: { projetoId },
    data: {
      financeiroProjectId: fin.id,
      // Data da detecção (o Financeiro guarda o valor transferido, não a data).
      ...(liberado ? { recursoLiberadoEm: new Date(), recursoFonte: "FINANCEIRO" } : {}),
    },
  });
}

/**
 * Cria as tarefas que faltam (a partir da pré-definição guardada no projeto) e
 * recalcula o prazo das tarefas geradas. Tarefas de cidade ou de ação que deixaram de existir
 * (ex.: o marcador "ação sem data" depois que a ação ganha agenda) são removidas
 * só se ninguém mexeu nelas (não iniciada e sem comentários).
 */
export async function sincronizarTarefas(projetoId: string) {
  // Uma sincronização por projeto de cada vez (duas abas abertas não duplicam tarefas).
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"acompanhamento:" + projetoId}))`;
      const [acomp, acoes, existentes] = await Promise.all([
        tx.acompanhamentoProjeto.findUnique({ where: { projetoId } }),
        tx.acao.findMany({
          where: { projetoId },
          select: { id: true, tipoId: true, agenda: { select: { id: true, cidade: true, uf: true, data: true, dataFim: true, online: true } } },
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

      const modelos = Array.isArray(acomp?.modelos)
        ? (acomp.modelos as unknown as ModeloTarefa[])
        : await tx.tarefaModelo.findMany({ where: { ativo: true }, select: CAMPOS_MODELO });
      const geradas = gerarTarefas({
        modelos,
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
