"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import type { PermissionCode } from "@/lib/permission-catalog";
import { hasScopeAccess, projetoWhereFromScope, resolveDataScope } from "@/lib/data-scope";
import { writeAuditLog } from "@/lib/audit";
import {
  pedeAtencao,
  percentualConcluido,
  statusGestao,
} from "@/lib/acompanhamento/regras";
import { copiaDaPreDefinicao, garantirAcompanhamento, sincronizarTarefas } from "@/lib/acompanhamento/sync";
import { territorioLabel } from "@/lib/acompanhamento/types";
import type {
  AcompanhamentoDTO,
  AreaTarefa,
  ComentarioDTO,
  FaseTarefa,
  ProjetoAcompResumoDTO,
  StatusTarefa,
} from "@/lib/acompanhamento/types";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const AREA_PERM: Record<AreaTarefa, PermissionCode> = {
  COMUNICACAO: "comunicacao:write",
  PRODUCAO: "producao:write",
};

const STATUS: StatusTarefa[] = ["NAO_CONTEMPLADA", "NAO_INICIADA", "EM_ANDAMENTO", "CONCLUIDA"];
const FASES: FaseTarefa[] = ["PLANEJAMENTO", "ESTRUTURACAO", "FLUXO_CONTINUO", "ENCERRAMENTO", "ANTES", "DURANTE", "DEPOIS"];

async function contexto() {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("acompanhamento:read")) throw new Error("Sem acesso ao acompanhamento.");
  const scope = await resolveDataScope(user.id);
  return { user, perms, scope };
}

/** Projeto visível para o usuário (escopo de dados). */
async function projetoVisivel(projetoId: string, scope: Awaited<ReturnType<typeof resolveDataScope>>) {
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: { id: true, nome: true, pronac: true, proponente: true, contextoId: true, contexto: { select: { nome: true } } },
  });
  if (!projeto) return null;
  return hasScopeAccess(scope, { contextoId: projeto.contextoId, idProjeto: projeto.id }) ? projeto : null;
}

const isoDia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function parseDia(v: string | null | undefined): Date | null | "invalida" {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "invalida";
  return new Date(`${v}T00:00:00Z`);
}

/** Lista dos projetos com o resumo do acompanhamento. */
export async function listAcompanhamentoProjetosAction(): Promise<ProjetoAcompResumoDTO[]> {
  const { scope } = await contexto();
  const projetos = await prisma.projeto.findMany({
    where: projetoWhereFromScope(scope),
    orderBy: [{ ano: "desc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      pronac: true,
      contexto: { select: { nome: true } },
      acompanhamento: { select: { recursoLiberadoEm: true } },
      _count: { select: { acoes: true } },
      tarefas: { select: { area: true, status: true, prazo: true } },
    },
  });
  const hoje = new Date();
  return projetos.map((p) => {
    const liberado = Boolean(p.acompanhamento?.recursoLiberadoEm);
    const daArea = (a: AreaTarefa) => p.tarefas.filter((t) => t.area === a).map((t) => t.status);
    return {
      id: p.id,
      nome: p.nome,
      pronac: p.pronac,
      contextoNome: p.contexto.nome,
      acoes: p._count.acoes,
      recursoLiberado: liberado,
      comunicacao: { pct: percentualConcluido(daArea("COMUNICACAO")), total: daArea("COMUNICACAO").length },
      producao: { pct: percentualConcluido(daArea("PRODUCAO")), total: daArea("PRODUCAO").length },
      pedemAtencao: p.tarefas.filter((t) =>
        pedeAtencao(statusGestao({ status: t.status, prazo: t.prazo, recursoLiberado: liberado, hoje })),
      ).length,
    };
  });
}

/** Página do projeto: garante o acompanhamento, sincroniza as tarefas e devolve tudo. */
export async function getAcompanhamentoAction(projetoId: string): Promise<AcompanhamentoDTO | null> {
  const { perms, scope } = await contexto();
  const projeto = await projetoVisivel(projetoId, scope);
  if (!projeto) return null;

  await garantirAcompanhamento(projetoId);
  await sincronizarTarefas(projetoId);

  const [acomp, acoes, tarefas] = await Promise.all([
    prisma.acompanhamentoProjeto.findUnique({ where: { projetoId } }),
    prisma.acao.findMany({
      where: { projetoId },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        tipoId: true,
        tipo: { select: { nome: true } },
        ofereceOnline: true,
        oferecePresencial: true,
        territorios: { orderBy: { ordem: "asc" }, select: { id: true, nome: true, cidade: true, estado: true } },
        agenda: {
          orderBy: { data: "asc" },
          select: {
            id: true,
            acaoId: true,
            titulo: true,
            cidade: true,
            uf: true,
            data: true,
            dataFim: true,
            online: true,
            territorioId: true,
            territorio: { select: { nome: true, cidade: true, estado: true } },
          },
        },
      },
    }),
    prisma.tarefa.findMany({
      where: { projetoId },
      orderBy: [{ nivel: "asc" }, { ordem: "asc" }, { prazo: "asc" }],
      include: {
        _count: { select: { comentarios: true } },
        comentarios: { where: { escalada: true, resolvidaEm: null }, select: { id: true } },
      },
    }),
  ]);
  const liberado = Boolean(acomp?.recursoLiberadoEm);
  const hoje = new Date();

  return {
    projeto: {
      id: projeto.id,
      nome: projeto.nome,
      pronac: projeto.pronac,
      proponente: projeto.proponente,
      contextoNome: projeto.contexto.nome,
    },
    inicioExecucao: isoDia(acomp?.inicioExecucao),
    fimExecucao: isoDia(acomp?.fimExecucao),
    recursoLiberadoEm: isoDia(acomp?.recursoLiberadoEm),
    financeiroVinculado: Boolean(acomp?.financeiroProjectId),
    preDefinicaoEm: isoDia(acomp?.modelosEm),
    acoes: acoes.map((a) => ({
      id: a.id,
      nome: a.nome,
      tipoId: a.tipoId,
      tipoNome: a.tipo.nome,
      ofereceOnline: a.ofereceOnline,
      oferecePresencial: a.oferecePresencial,
      territorios: a.territorios.map((t) => ({ id: t.id, label: territorioLabel(t) })),
      agenda: a.agenda.map(({ territorio, ...g }) => ({
        ...g,
        data: isoDia(g.data)!,
        dataFim: isoDia(g.dataFim),
        local: g.online
          ? "Online"
          : territorio
            ? territorioLabel(territorio)
            : [g.cidade, g.uf].filter(Boolean).join(", "),
      })),
    })),
    tarefas: tarefas.map((t) => ({
      id: t.id,
      area: t.area,
      nivel: t.nivel,
      fase: t.fase,
      titulo: t.titulo,
      detalhamento: t.detalhamento,
      unidade: t.unidade,
      acaoId: t.acaoId,
      agendaId: t.agendaId,
      cidade: t.cidade,
      uf: t.uf,
      status: t.status,
      gestao: statusGestao({ status: t.status, prazo: t.prazo, recursoLiberado: liberado, hoje }),
      prazo: isoDia(t.prazo),
      avulsa: !t.modeloId,
      comentarios: t._count.comentarios,
      escaladasAbertas: t.comentarios.length,
    })),
    pode: {
      comunicacao: perms.has("comunicacao:write"),
      producao: perms.has("producao:write"),
      gestao: perms.has("acompanhamento:gestao"),
    },
  };
}

function revalidar(projetoId: string) {
  revalidatePath(`/dashboard/acompanhamento/${projetoId}`);
  revalidatePath("/dashboard/acompanhamento");
}

async function tarefaComPermissao(tarefaId: string) {
  const ctx = await contexto();
  const tarefa = await prisma.tarefa.findUnique({ where: { id: tarefaId } });
  if (!tarefa) return { erro: "Tarefa não encontrada." } as const;
  if (!(await projetoVisivel(tarefa.projetoId, ctx.scope))) return { erro: "Sem acesso a este projeto." } as const;
  return { ...ctx, tarefa } as const;
}

/** A equipe da área troca o status da tarefa. */
export async function setTarefaStatusAction(tarefaId: string, status: StatusTarefa): Promise<Result> {
  if (!STATUS.includes(status)) return { ok: false, error: "Status inválido." };
  const r = await tarefaComPermissao(tarefaId);
  if ("erro" in r) return { ok: false, error: r.erro! };
  if (!r.perms.has(AREA_PERM[r.tarefa.area])) {
    return { ok: false, error: "Só a equipe desta área atualiza o status." };
  }
  await prisma.tarefa.update({
    where: { id: tarefaId },
    data: {
      status,
      concluidaEm: status === "CONCLUIDA" ? new Date() : null,
      atualizadoPor: r.user.id,
    },
  });
  revalidar(r.tarefa.projetoId);
  return { ok: true };
}

/** Edita título, detalhamento e prazo (a equipe da área). */
export async function editTarefaAction(
  tarefaId: string,
  input: { titulo: string; detalhamento: string; prazo: string | null },
): Promise<Result> {
  const r = await tarefaComPermissao(tarefaId);
  if ("erro" in r) return { ok: false, error: r.erro! };
  if (!r.perms.has(AREA_PERM[r.tarefa.area])) return { ok: false, error: "Só a equipe desta área edita a tarefa." };
  const titulo = input.titulo.trim();
  if (!titulo) return { ok: false, error: "Informe o título." };
  const prazo = parseDia(input.prazo);
  if (prazo === "invalida") return { ok: false, error: "Prazo inválido." };
  await prisma.tarefa.update({
    where: { id: tarefaId },
    data: {
      titulo: titulo.slice(0, 200),
      detalhamento: input.detalhamento.trim().slice(0, 2000),
      prazo,
      // Prazo mudado à mão deixa de seguir a pré-definição (a tarefa continua ligada a ela).
      ...((r.tarefa.prazo?.getTime() ?? null) !== (prazo?.getTime() ?? null) ? { prazoManual: true } : {}),
      atualizadoPor: r.user.id,
    },
  });
  revalidar(r.tarefa.projetoId);
  return { ok: true };
}

export async function listComentariosAction(tarefaId: string): Promise<ComentarioDTO[]> {
  const r = await tarefaComPermissao(tarefaId);
  if ("erro" in r) return [];
  const rows = await prisma.tarefaComentario.findMany({ where: { tarefaId }, orderBy: { createdAt: "asc" } });
  const autores = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((c) => c.autorId))] } },
    select: { id: true, name: true, email: true },
  });
  const nome = new Map(autores.map((a) => [a.id, a.name || a.email]));
  return rows.map((c) => ({
    id: c.id,
    autorNome: nome.get(c.autorId) ?? "—",
    texto: c.texto,
    escalada: c.escalada,
    resolvida: Boolean(c.resolvidaEm),
    criadoEm: c.createdAt.toISOString(),
  }));
}

/** Observação na tarefa; `escalar` leva o assunto à gestão. */
export async function addComentarioAction(
  tarefaId: string,
  input: { texto: string; escalar: boolean },
): Promise<Result> {
  const r = await tarefaComPermissao(tarefaId);
  if ("erro" in r) return { ok: false, error: r.erro! };
  const podeArea = r.perms.has(AREA_PERM[r.tarefa.area]);
  if (!podeArea && !r.perms.has("acompanhamento:gestao")) {
    return { ok: false, error: "Sem permissão para comentar nesta área." };
  }
  const texto = input.texto.trim();
  if (!texto) return { ok: false, error: "Escreva a observação." };
  await prisma.tarefaComentario.create({
    data: { tarefaId, autorId: r.user.id, texto: texto.slice(0, 2000), escalada: Boolean(input.escalar) },
  });
  if (input.escalar) {
    await writeAuditLog({
      actorUserId: r.user.id,
      action: "acompanhamento.escalada",
      entityType: "Tarefa",
      entityId: tarefaId,
      meta: { projetoId: r.tarefa.projetoId, titulo: r.tarefa.titulo },
    });
  }
  revalidar(r.tarefa.projetoId);
  return { ok: true };
}

/** Tarefa fora do padrão, criada pela equipe da área. */
export async function createTarefaAvulsaAction(
  projetoId: string,
  input: {
    area: AreaTarefa;
    nivel: number;
    fase: FaseTarefa;
    titulo: string;
    detalhamento?: string;
    prazo?: string | null;
    acaoId?: string | null;
    agendaId?: string | null;
    cidade?: string | null;
    uf?: string | null;
  },
): Promise<Result> {
  const { user, perms, scope } = await contexto();
  if (!(input.area in AREA_PERM) || !FASES.includes(input.fase) || ![1, 2].includes(input.nivel)) {
    return { ok: false, error: "Dados inválidos." };
  }
  if (!perms.has(AREA_PERM[input.area])) return { ok: false, error: "Só a equipe desta área cria tarefas." };
  if (!(await projetoVisivel(projetoId, scope))) return { ok: false, error: "Sem acesso a este projeto." };
  const titulo = input.titulo.trim();
  if (!titulo) return { ok: false, error: "Informe o título." };
  const prazo = parseDia(input.prazo);
  if (prazo === "invalida") return { ok: false, error: "Prazo inválido." };
  if (input.acaoId) {
    const acao = await prisma.acao.findFirst({ where: { id: input.acaoId, projetoId }, select: { id: true } });
    if (!acao) return { ok: false, error: "Ação não encontrada neste projeto." };
  }
  const unidade = input.nivel === 1 ? "PROJETO" : input.acaoId ? "ACAO" : "CIDADE";
  await prisma.tarefa.create({
    data: {
      projetoId,
      area: input.area,
      nivel: input.nivel,
      fase: input.fase,
      titulo: titulo.slice(0, 200),
      detalhamento: (input.detalhamento || "").trim().slice(0, 2000),
      unidade,
      acaoId: input.acaoId || null,
      agendaId: input.agendaId || null,
      cidade: input.cidade?.trim() || null,
      uf: input.uf?.trim().toUpperCase() || null,
      prazo,
      ordem: 999,
      atualizadoPor: user.id,
    },
  });
  revalidar(projetoId);
  return { ok: true };
}

/** Datas de execução do projeto (gestão). Recalcula os prazos. */
export async function setDatasProjetoAction(
  projetoId: string,
  input: { inicioExecucao: string | null; fimExecucao: string | null },
): Promise<Result> {
  const { user, perms, scope } = await contexto();
  if (!perms.has("acompanhamento:gestao")) return { ok: false, error: "Só a gestão altera as datas." };
  if (!(await projetoVisivel(projetoId, scope))) return { ok: false, error: "Sem acesso a este projeto." };
  const inicio = parseDia(input.inicioExecucao);
  const fim = parseDia(input.fimExecucao);
  if (inicio === "invalida" || fim === "invalida") return { ok: false, error: "Data inválida." };
  if (inicio && fim && fim < inicio) return { ok: false, error: "O fim não pode ser antes do início." };
  await prisma.acompanhamentoProjeto.upsert({
    where: { projetoId },
    create: { projetoId, inicioExecucao: inicio, fimExecucao: fim },
    update: { inicioExecucao: inicio, fimExecucao: fim },
  });
  await sincronizarTarefas(projetoId);
  await writeAuditLog({
    actorUserId: user.id,
    action: "acompanhamento.datas",
    entityType: "Projeto",
    entityId: projetoId,
    meta: { inicioExecucao: input.inicioExecucao, fimExecucao: input.fimExecucao },
  });
  revalidar(projetoId);
  return { ok: true };
}

/**
 * Troca a pré-definição guardada no projeto pela atual (gestão). Tarefas novas
 * da pré-definição entram; datas não editadas à mão são recalculadas.
 */
export async function atualizarPreDefinicaoProjetoAction(projetoId: string): Promise<Result> {
  const { user, perms, scope } = await contexto();
  if (!perms.has("acompanhamento:gestao")) return { ok: false, error: "Só a gestão atualiza a pré-definição do projeto." };
  if (!(await projetoVisivel(projetoId, scope))) return { ok: false, error: "Sem acesso a este projeto." };
  await prisma.acompanhamentoProjeto.update({
    where: { projetoId },
    data: { modelos: await copiaDaPreDefinicao(), modelosEm: new Date() },
  });
  await sincronizarTarefas(projetoId);
  await writeAuditLog({
    actorUserId: user.id,
    action: "acompanhamento.predefinicao_projeto",
    entityType: "Projeto",
    entityId: projetoId,
    meta: {},
  });
  revalidar(projetoId);
  return { ok: true };
}

/**
 * Nova execução de uma ação (gestão): período e local, que é um dos territórios
 * cadastrados na ação ou "online". Gera as tarefas de nível 2.
 */
export async function addAgendaAction(
  acaoId: string,
  input: { titulo: string; data: string; dataFim?: string | null; territorioId?: string | null; online?: boolean },
): Promise<Result> {
  const { perms, scope } = await contexto();
  if (!perms.has("acompanhamento:gestao")) return { ok: false, error: "Só a gestão altera a agenda." };
  const acao = await prisma.acao.findUnique({
    where: { id: acaoId },
    select: { id: true, projetoId: true, ofereceOnline: true, territorios: { select: { id: true, cidade: true, estado: true } } },
  });
  if (!acao || !(await projetoVisivel(acao.projetoId, scope))) return { ok: false, error: "Ação não encontrada." };
  const data = parseDia(input.data);
  if (!data || data === "invalida") return { ok: false, error: "Informe o início." };
  const dataFim = parseDia(input.dataFim);
  if (dataFim === "invalida") return { ok: false, error: "Fim inválido." };
  if (dataFim && dataFim < data) return { ok: false, error: "O fim não pode ser antes do início." };
  const territorio = input.online ? null : acao.territorios.find((t) => t.id === input.territorioId);
  if (input.online && !acao.ofereceOnline) return { ok: false, error: "Esta ação não é online." };
  if (!input.online && !territorio) return { ok: false, error: "Escolha um dos territórios da ação." };
  await prisma.acaoAgenda.create({
    data: {
      acaoId,
      titulo: input.titulo.trim().slice(0, 120),
      online: Boolean(input.online),
      territorioId: territorio?.id ?? null,
      cidade: territorio?.cidade.trim() ?? "",
      uf: territorio?.estado.trim().toUpperCase() ?? "",
      data,
      dataFim: dataFim && dataFim > data ? dataFim : null,
    },
  });
  await sincronizarTarefas(acao.projetoId);
  revalidar(acao.projetoId);
  return { ok: true };
}

/** Remove uma realização (gestão). As tarefas dela saem junto. */
export async function removeAgendaAction(agendaId: string): Promise<Result> {
  const { perms, scope } = await contexto();
  if (!perms.has("acompanhamento:gestao")) return { ok: false, error: "Só a gestão altera a agenda." };
  const ag = await prisma.acaoAgenda.findUnique({
    where: { id: agendaId },
    select: { id: true, acao: { select: { projetoId: true } } },
  });
  if (!ag || !(await projetoVisivel(ag.acao.projetoId, scope))) return { ok: false, error: "Data não encontrada." };
  await prisma.acaoAgenda.delete({ where: { id: agendaId } });
  await sincronizarTarefas(ag.acao.projetoId);
  revalidar(ag.acao.projetoId);
  return { ok: true };
}
