"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import type { PermissionCode } from "@/lib/permission-catalog";
import { hasScopeAccess, projetoWhereFromScope, resolveDataScope } from "@/lib/data-scope";
import { writeAuditLog } from "@/lib/audit";
import {
  diaEmBrasilia,
  diasAposPrazo,
  percentualConcluido,
  statusGestao,
  type ModeloTarefa,
} from "@/lib/acompanhamento/regras";
import {
  copiaDaPreDefinicao,
  garantirAcompanhamento,
  sincronizarTarefas,
  verificarRecurso,
} from "@/lib/acompanhamento/sync";
import {
  buscarProjetoFinanceiroPorId,
  financeiroLabel,
  listarProjetosFinanceiro,
} from "@/lib/acompanhamento/financeiro";
import { territorioLabel } from "@/lib/acompanhamento/types";
import type {
  AcompanhamentoDTO,
  AreaTarefa,
  ComentarioDTO,
  FaseTarefa,
  ListaAcompanhamentoDTO,
  ListaAcompanhamentoParams,
  PrazoBase,
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

const PAGE_SIZE = 25;

const fonte = (v: string | null | undefined) => (v === "GESTAO" ? "GESTAO" : v === "FINANCEIRO" ? "FINANCEIRO" : null);

/**
 * Lista dos projetos com o resumo do acompanhamento: busca (nome, PRONAC,
 * proponente, contexto), filtros e paginação. Atrasadas/vencendo são calculadas
 * (não fica gravado), por isso o filtro e a ordem são feitos em memória.
 */
export async function listAcompanhamentoProjetosAction(
  params: ListaAcompanhamentoParams = {},
): Promise<ListaAcompanhamentoDTO> {
  const { scope } = await contexto();
  const q = params.q?.trim();
  const escopo = projetoWhereFromScope(scope);
  const where: Prisma.ProjetoWhereInput = {
    AND: [
      escopo,
      params.contextoId ? { contextoId: params.contextoId } : {},
      params.recurso === "liberado" ? { acompanhamento: { recursoLiberadoEm: { not: null } } } : {},
      params.recurso === "aguardando"
        ? { OR: [{ acompanhamento: null }, { acompanhamento: { recursoLiberadoEm: null } }] }
        : {},
      q
        ? {
            OR: [
              { nome: { contains: q, mode: "insensitive" } },
              { pronac: { contains: q.replace(/\D/g, "") || q } },
              { proponente: { contains: q, mode: "insensitive" } },
              { contexto: { nome: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [projetos, contextos] = await Promise.all([
    prisma.projeto.findMany({
      where,
      orderBy: [{ nome: "asc" }],
      select: {
        id: true,
        nome: true,
        pronac: true,
        contexto: { select: { nome: true } },
        acompanhamento: { select: { recursoLiberadoEm: true, recursoFonte: true } },
        _count: { select: { acoes: true } },
        tarefas: { select: { area: true, status: true, prazo: true } },
      },
    }),
    prisma.contexto.findMany({
      where: { projetos: { some: escopo } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);
  const hoje = new Date();
  let items: ProjetoAcompResumoDTO[] = projetos.map((p) => {
    const liberado = Boolean(p.acompanhamento?.recursoLiberadoEm);
    const gestao = p.tarefas.map((t) => statusGestao({ status: t.status, prazo: t.prazo, recursoLiberado: liberado, hoje }));
    const emAtraso = gestao.filter((g) => g === "EM_ATRASO").length;
    const vencendo = gestao.filter((g) => g === "PRAZO_PROXIMO").length;
    const daArea = (a: AreaTarefa) => p.tarefas.filter((t) => t.area === a).map((t) => t.status);
    return {
      id: p.id,
      nome: p.nome,
      pronac: p.pronac,
      contextoNome: p.contexto.nome,
      acoes: p._count.acoes,
      recursoLiberado: liberado,
      recursoFonte: liberado ? fonte(p.acompanhamento?.recursoFonte) : null,
      comunicacao: { pct: percentualConcluido(daArea("COMUNICACAO")), total: daArea("COMUNICACAO").length },
      producao: { pct: percentualConcluido(daArea("PRODUCAO")), total: daArea("PRODUCAO").length },
      emAtraso,
      vencendo,
      pedemAtencao: emAtraso + vencendo,
    };
  });
  if (params.atencao) items = items.filter((i) => i.pedemAtencao > 0);
  if (params.ordem === "atencao") {
    items.sort(
      (a, b) => b.emAtraso - a.emAtraso || b.vencendo - a.vencendo || a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(params.page || 1)), pageCount);
  return {
    items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total,
    page,
    pageCount,
    pageSize: PAGE_SIZE,
    contextos,
  };
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
  const doProjeto = Array.isArray(acomp?.modelos) ? (acomp.modelos as unknown as ModeloTarefa[]) : [];
  const geral = new Map(
    (
      await prisma.tarefaModelo.findMany({
        where: { id: { in: doProjeto.map((m) => m.id) }, ativo: true },
        select: { id: true, prazoBase: true, prazoDias: true },
      })
    ).map((m) => [m.id, m]),
  );
  const fin = acomp?.financeiroProjectId ? await buscarProjetoFinanceiroPorId(acomp.financeiroProjectId) : null;

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
    recursoFonte: liberado ? fonte(acomp?.recursoFonte) : null,
    financeiro: fin
      ? { id: fin.id, nome: fin.nome || fin.codigo, label: financeiroLabel(fin), captadoTransferido: fin.captadoTransferido }
      : null,
    financeiroManual: Boolean(acomp?.financeiroManual),
    preDefinicaoEm: isoDia(acomp?.modelosEm),
    prazos: doProjeto
      .filter((m) => m.ativo !== false)
      .map((m) => {
        const g = geral.get(m.id);
        return {
          modeloId: m.id,
          area: m.area,
          nivel: m.nivel,
          fase: m.fase,
          titulo: m.titulo,
          prazoBase: m.prazoBase,
          prazoDias: m.prazoDias,
          padrao: g ? { prazoBase: g.prazoBase, prazoDias: g.prazoDias } : null,
          editadasAMao: tarefas.filter((t) => t.modeloId === m.id && t.prazoManual).length,
        };
      }),
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
      concluidaEm: t.status === "CONCLUIDA" && t.concluidaEm ? isoDia(diaEmBrasilia(t.concluidaEm)) : null,
      diasAposPrazo: t.status === "CONCLUIDA" ? diasAposPrazo(t.prazo, t.concluidaEm) : null,
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
      // Guarda o dia em que foi concluída (marcar "Concluída" de novo não muda a data).
      concluidaEm: status === "CONCLUIDA" ? (r.tarefa.status === "CONCLUIDA" ? r.tarefa.concluidaEm : null) ?? new Date() : null,
      atualizadoPor: r.user.id,
    },
  });
  revalidar(r.tarefa.projetoId);
  return { ok: true };
}

/** Edita título, detalhamento, prazo e o dia da conclusão (a equipe da área). */
export async function editTarefaAction(
  tarefaId: string,
  input: { titulo: string; detalhamento: string; prazo: string | null; concluidaEm?: string | null },
): Promise<Result> {
  const r = await tarefaComPermissao(tarefaId);
  if ("erro" in r) return { ok: false, error: r.erro! };
  if (!r.perms.has(AREA_PERM[r.tarefa.area])) return { ok: false, error: "Só a equipe desta área edita a tarefa." };
  const titulo = input.titulo.trim();
  if (!titulo) return { ok: false, error: "Informe o título." };
  const prazo = parseDia(input.prazo);
  if (prazo === "invalida") return { ok: false, error: "Prazo inválido." };
  // Dia da conclusão corrigido à mão (só para tarefa concluída; meio-dia de Brasília).
  let concluidaEm: Date | undefined;
  if (r.tarefa.status === "CONCLUIDA" && input.concluidaEm) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.concluidaEm)) return { ok: false, error: "Data de conclusão inválida." };
    concluidaEm = new Date(`${input.concluidaEm}T12:00:00-03:00`);
    if (concluidaEm.getTime() > Date.now()) return { ok: false, error: "A conclusão não pode ser no futuro." };
  }
  await prisma.tarefa.update({
    where: { id: tarefaId },
    data: {
      titulo: titulo.slice(0, 200),
      detalhamento: input.detalhamento.trim().slice(0, 2000),
      prazo,
      ...(concluidaEm ? { concluidaEm } : {}),
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
 * Prazo de uma tarefa só neste projeto (gestão): muda a regra D±N na
 * pré-definição guardada no projeto e recalcula as tarefas dela que não
 * tiveram o prazo editado à mão. A pré-definição geral não muda.
 */
export async function setPrazoProjetoAction(
  projetoId: string,
  modeloId: string,
  input: { prazoBase: PrazoBase | null; prazoDias: number | null },
): Promise<Result> {
  const { user, perms, scope } = await contexto();
  if (!perms.has("acompanhamento:gestao")) return { ok: false, error: "Só a gestão altera os prazos do projeto." };
  if (!(await projetoVisivel(projetoId, scope))) return { ok: false, error: "Sem acesso a este projeto." };
  const acomp = await prisma.acompanhamentoProjeto.findUnique({ where: { projetoId }, select: { modelos: true } });
  const modelos = Array.isArray(acomp?.modelos) ? (acomp.modelos as unknown as ModeloTarefa[]) : null;
  const m = modelos?.find((x) => x.id === modeloId);
  if (!modelos || !m) return { ok: false, error: "Tarefa não encontrada neste projeto." };
  const semPrazo = input.prazoBase == null || input.prazoDias == null;
  const bases: PrazoBase[] = m.nivel === 1 ? ["INICIO_EXECUCAO", "FIM_EXECUCAO"] : ["INICIO_ACAO", "FIM_ACAO"];
  if (!semPrazo && (!bases.includes(input.prazoBase!) || !Number.isInteger(input.prazoDias) || Math.abs(input.prazoDias!) > 3650)) {
    return { ok: false, error: "Prazo inválido." };
  }
  const novo = { prazoBase: semPrazo ? null : input.prazoBase, prazoDias: semPrazo ? null : input.prazoDias };
  await prisma.acompanhamentoProjeto.update({
    where: { projetoId },
    data: { modelos: modelos.map((x) => (x.id === modeloId ? { ...x, ...novo } : x)) as unknown as Prisma.InputJsonValue },
  });
  await sincronizarTarefas(projetoId);
  await writeAuditLog({
    actorUserId: user.id,
    action: "acompanhamento.prazo_projeto",
    entityType: "Projeto",
    entityId: projetoId,
    meta: { modeloId, antes: { prazoBase: m.prazoBase, prazoDias: m.prazoDias }, depois: novo },
  });
  revalidar(projetoId);
  return { ok: true };
}

/** Projetos do MAX Financeiro para a gestão vincular (projetos de outras leis, sem PRONAC). */
export async function buscarFinanceiroAction(q: string): Promise<Array<{ id: string; nome: string; label: string }>> {
  const { perms } = await contexto();
  if (!perms.has("acompanhamento:gestao")) return [];
  const lista = await listarProjetosFinanceiro(q.slice(0, 80));
  return lista.map((f) => ({ id: f.id, nome: f.nome || f.codigo, label: financeiroLabel(f) }));
}

/**
 * Liga o projeto a um projeto do MAX Financeiro (gestão). `null` desfaz o
 * vínculo manual e volta a procurar pelo PRONAC.
 */
export async function vincularFinanceiroAction(projetoId: string, financeiroId: string | null): Promise<Result> {
  const { user, perms, scope } = await contexto();
  if (!perms.has("acompanhamento:gestao")) return { ok: false, error: "Só a gestão altera o vínculo." };
  if (!(await projetoVisivel(projetoId, scope))) return { ok: false, error: "Sem acesso a este projeto." };
  if (financeiroId && !(await buscarProjetoFinanceiroPorId(financeiroId))) {
    return { ok: false, error: "Projeto não encontrado no MAX Financeiro." };
  }
  await garantirAcompanhamento(projetoId);
  await prisma.acompanhamentoProjeto.update({
    where: { projetoId },
    data: { financeiroProjectId: financeiroId, financeiroManual: Boolean(financeiroId) },
  });
  await verificarRecurso(projetoId);
  await writeAuditLog({
    actorUserId: user.id,
    action: "acompanhamento.financeiro_vinculo",
    entityType: "Projeto",
    entityId: projetoId,
    meta: { financeiroId },
  });
  revalidar(projetoId);
  return { ok: true };
}

/**
 * Recurso liberado informado pela gestão (data em yyyy-mm-dd), para corrigir a
 * data ou para projeto fora do Financeiro. `null` volta para "aguardando" e
 * deixa o Financeiro detectar de novo.
 */
export async function setRecursoLiberadoAction(projetoId: string, data: string | null): Promise<Result> {
  const { user, perms, scope } = await contexto();
  if (!perms.has("acompanhamento:gestao")) return { ok: false, error: "Só a gestão altera o recurso." };
  if (!(await projetoVisivel(projetoId, scope))) return { ok: false, error: "Sem acesso a este projeto." };
  const dia = parseDia(data);
  if (dia === "invalida") return { ok: false, error: "Data inválida." };
  // Meio-dia de Brasília: o dia não muda com o fuso.
  const quando = dia ? new Date(`${data}T12:00:00-03:00`) : null;
  if (quando && quando.getTime() > Date.now()) return { ok: false, error: "A liberação não pode ser no futuro." };
  await garantirAcompanhamento(projetoId);
  await prisma.acompanhamentoProjeto.update({
    where: { projetoId },
    data: { recursoLiberadoEm: quando, recursoFonte: quando ? "GESTAO" : null },
  });
  if (!quando) await verificarRecurso(projetoId);
  await writeAuditLog({
    actorUserId: user.id,
    action: "acompanhamento.recurso",
    entityType: "Projeto",
    entityId: projetoId,
    meta: { recursoLiberadoEm: data },
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
