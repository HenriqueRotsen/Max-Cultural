"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import type { PermissionCode } from "@/lib/permission-catalog";
import { hasScopeAccess, projetoWhereFromScope, resolveDataScope } from "@/lib/data-scope";
import { writeAuditLog } from "@/lib/audit";
import { territorioLabel } from "@/lib/acompanhamento/types";
import {
  EQUIPES,
  mapaProdutoDaAcao,
  mesesDoPeriodo,
  normalizarValor,
  progressoEquipe,
  enderecoLabel,
  SUGESTOES_POR_TIPO,
  type CampoPrestacao,
  type FonteSugestao,
  type EquipePrestacao,
  type TipoCampoPrestacao,
  type ValoresFicha,
} from "@/lib/prestacao/regras";
import { CATEGORIAS_DOC, CATEGORIAS_FOTO, LEIS } from "@/lib/prestacao/types";
import { removerArquivoPrivado } from "@/lib/storage/privado";
import { aggregateSocio } from "@/lib/socio";
import type { Endereco, PerfilResumo } from "@/lib/prestacao/regras";
import type {
  ArquivoDTO,
  CampoDTO,
  ContextoSugestaoDTO,
  FichaDTO,
  ListaPrestacaoDTO,
  PrestacaoProjetoDTO,
  PrestacaoResumoDTO,
  ProgressoDTO,
  SistemaDTO,
} from "@/lib/prestacao/types";

type Result = { ok: true } | { ok: false; error: string };

const EQUIPE_PERM: Record<EquipePrestacao, PermissionCode> = {
  PRODUCAO: "prestacao:producao",
  COMUNICACAO: "prestacao:comunicacao",
  GESTAO: "prestacao:gestao",
};

const PAGE_SIZE = 25;

async function contexto() {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("prestacao:read")) throw new Error("Sem acesso à prestação de contas.");
  const scope = await resolveDataScope(user.id);
  const pode = Object.fromEntries(EQUIPES.map((e) => [e, perms.has(EQUIPE_PERM[e])])) as Record<EquipePrestacao, boolean>;
  return { user, perms, scope, pode };
}

async function projetoVisivel(projetoId: string, scope: Awaited<ReturnType<typeof resolveDataScope>>) {
  const p = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: {
      id: true,
      nome: true,
      pronac: true,
      proponente: true,
      ano: true,
      contextoId: true,
      contexto: { select: { nome: true } },
    },
  });
  if (!p) return null;
  return hasScopeAccess(scope, { contextoId: p.contextoId, idProjeto: p.id }) ? p : null;
}

const isoDia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const comoValores = (v: unknown): ValoresFicha => (v && typeof v === "object" ? (v as ValoresFicha) : {});

async function camposAtivos(): Promise<CampoPrestacao[]> {
  return prisma.prestacaoCampo.findMany({
    where: { ativo: true },
    orderBy: [{ equipe: "asc" }, { ordem: "asc" }],
    select: { chave: true, rotulo: true, tipo: true, opcoes: true, equipe: true, obrigatorio: true, ativo: true },
  });
}

function progressoFicha(campos: CampoPrestacao[], valores: ValoresFicha): ProgressoDTO {
  return Object.fromEntries(
    EQUIPES.map((e) => {
      const p = progressoEquipe(campos, valores, e);
      return [e, { pct: p.pct, faltando: p.faltando }];
    }),
  ) as ProgressoDTO;
}

/** Média por equipe entre as fichas (execuções sem ficha contam como 0%). */
function progressoProjeto(campos: CampoPrestacao[], fichas: ValoresFicha[], execucoes: number): ProgressoDTO {
  return Object.fromEntries(
    EQUIPES.map((e) => {
      const faltando: string[] = [];
      if (!execucoes) return [e, { pct: 0, faltando }];
      const soma = fichas.reduce((acc, v) => acc + progressoEquipe(campos, v, e).pct, 0);
      return [e, { pct: Math.round(soma / execucoes), faltando }];
    }),
  ) as unknown as ProgressoDTO;
}

function revalidar(projetoId: string, agendaId?: string) {
  revalidatePath("/dashboard/prestacao");
  revalidatePath(`/dashboard/prestacao/${projetoId}`);
  if (agendaId) revalidatePath(`/dashboard/prestacao/${projetoId}/ficha/${agendaId}`);
}

// ── Lista ────────────────────────────────────────────────────────────────

export async function listPrestacaoProjetosAction(params: {
  q?: string;
  contextoId?: string;
  lei?: string;
  entregue?: "sim" | "nao";
  page?: number;
}): Promise<ListaPrestacaoDTO> {
  const { scope } = await contexto();
  const q = params.q?.trim();
  const escopo = projetoWhereFromScope(scope);
  const where: Prisma.ProjetoWhereInput = {
    AND: [
      escopo,
      params.contextoId ? { contextoId: params.contextoId } : {},
      params.lei ? { prestacao: { lei: params.lei } } : {},
      params.entregue === "sim" ? { prestacao: { entregueEm: { not: null } } } : {},
      params.entregue === "nao" ? { OR: [{ prestacao: null }, { prestacao: { entregueEm: null } }] } : {},
      q
        ? {
            OR: [
              { nome: { contains: q, mode: "insensitive" } },
              { pronac: { contains: q.replace(/\D/g, "") || q } },
              { proponente: { contains: q, mode: "insensitive" } },
              { contexto: { nome: { contains: q, mode: "insensitive" } } },
              { prestacao: { patrocinador: { contains: q, mode: "insensitive" } } },
              { prestacao: { identificacao: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [total, contextos, campos] = await Promise.all([
    prisma.projeto.count({ where }),
    prisma.contexto.findMany({ where: { projetos: { some: escopo } }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    camposAtivos(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(params.page || 1)), pageCount);
  const projetos = await prisma.projeto.findMany({
    where,
    orderBy: [{ nome: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      nome: true,
      pronac: true,
      contexto: { select: { nome: true } },
      prestacao: { select: { lei: true, identificacao: true, patrocinador: true, entregueEm: true } },
      fichas: { select: { valores: true } },
      acoes: { select: { _count: { select: { agenda: true } } } },
    },
  });
  const items: PrestacaoResumoDTO[] = projetos.map((p) => {
    const execucoes = p.acoes.reduce((acc, a) => acc + a._count.agenda, 0);
    const prog = progressoProjeto(campos, p.fichas.map((f) => comoValores(f.valores)), execucoes);
    return {
      id: p.id,
      nome: p.nome,
      pronac: p.pronac,
      contextoNome: p.contexto.nome,
      lei: p.prestacao?.lei ?? null,
      identificacao: p.prestacao?.identificacao ?? "",
      patrocinador: p.prestacao?.patrocinador ?? "",
      execucoes,
      progresso: { PRODUCAO: prog.PRODUCAO.pct, COMUNICACAO: prog.COMUNICACAO.pct, GESTAO: prog.GESTAO.pct },
      entregueEm: isoDia(p.prestacao?.entregueEm),
    };
  });
  return { items, total, page, pageCount, pageSize: PAGE_SIZE, contextos };
}

// ── Projeto ──────────────────────────────────────────────────────────────

export async function getPrestacaoProjetoAction(projetoId: string): Promise<PrestacaoProjetoDTO | null> {
  const { scope, pode } = await contexto();
  const projeto = await projetoVisivel(projetoId, scope);
  if (!projeto) return null;
  const [dados, produtos, acoes, fichas, campos] = await Promise.all([
    prisma.prestacaoProjeto.findUnique({ where: { projetoId } }),
    prisma.prestacaoProduto.findMany({ where: { projetoId }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] }),
    prisma.acao.findMany({
      where: { projetoId },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        tipo: { select: { nome: true } },
        agenda: {
          orderBy: { data: "asc" },
          select: {
            id: true,
            titulo: true,
            data: true,
            dataFim: true,
            online: true,
            cidade: true,
            uf: true,
            territorio: { select: { nome: true, cidade: true, estado: true } },
          },
        },
      },
    }),
    prisma.prestacaoFicha.findMany({ where: { projetoId }, select: { agendaId: true, valores: true } }),
    camposAtivos(),
  ]);
  const relatorios = await prisma.prestacaoRelatorio.findMany({
    where: { projetoId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { produto: { select: { nome: true } } },
  });
  const autores = await prisma.user.findMany({
    where: { id: { in: [...new Set(relatorios.map((r) => r.geradoPor).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, name: true, email: true },
  });
  const autor = new Map(autores.map((u) => [u.id, u.name || u.email]));
  const fichaPorAgenda = new Map(fichas.map((f) => [f.agendaId, f]));
  const produtoDaAcao = mapaProdutoDaAcao(produtos);
  const execucoes = acoes.flatMap((a) =>
    a.agenda.map((g) => {
      const f = fichaPorAgenda.get(g.id);
      return {
        agendaId: g.id,
        acaoId: a.id,
        acaoNome: a.nome,
        tipoNome: a.tipo.nome,
        local: g.online ? "Online" : g.territorio ? territorioLabel(g.territorio) : [g.cidade, g.uf].filter(Boolean).join(", "),
        data: isoDia(g.data)!,
        dataFim: isoDia(g.dataFim),
        titulo: g.titulo,
        produtoId: produtoDaAcao.get(a.id) ?? null,
        progresso: progressoFicha(campos, comoValores(f?.valores)),
      };
    }),
  );
  return {
    projeto: {
      id: projeto.id,
      nome: projeto.nome,
      pronac: projeto.pronac,
      proponente: projeto.proponente,
      ano: projeto.ano,
      contextoNome: projeto.contexto.nome,
    },
    dados: {
      lei: dados?.lei ?? null,
      // Sem identificação informada, sugere o PRONAC do projeto.
      identificacao: dados?.identificacao || (projeto.pronac ? `PRONAC ${projeto.pronac}` : ""),
      patrocinador: dados?.patrocinador ?? "",
      entregueEm: isoDia(dados?.entregueEm),
    },
    produtos: produtos.map((p) => ({
      id: p.id,
      nome: p.nome,
      meta: p.meta,
      acaoIds: p.acaoIds.filter((id) => produtoDaAcao.get(id) === p.id),
      execucoes: acoes.filter((a) => produtoDaAcao.get(a.id) === p.id).reduce((n, a) => n + a.agenda.length, 0),
    })),
    acoes: acoes.map((a) => ({ id: a.id, nome: a.nome, execucoes: a.agenda.length })),
    execucoes,
    acoesSemAgenda: acoes.filter((a) => !a.agenda.length).map((a) => ({ id: a.id, nome: a.nome })),
    relatorios: relatorios.map((r) => ({
      id: r.id,
      titulo: r.titulo,
      produtoNome: r.produto?.nome ?? null,
      tamanho: r.tamanho,
      paginas: r.paginas,
      geradoEm: r.createdAt.toISOString(),
      geradoPorNome: (r.geradoPor && autor.get(r.geradoPor)) || "—",
      url: `/api/prestacao/relatorios/${r.id}`,
    })),
    progresso: progressoProjeto(campos, fichas.map((f) => comoValores(f.valores)), execucoes.length),
    pode,
  };
}

async function gestaoDoProjeto(projetoId: string) {
  const ctx = await contexto();
  if (!ctx.pode.GESTAO) return { erro: "Só a gestão da prestação de contas altera isto." } as const;
  if (!(await projetoVisivel(projetoId, ctx.scope))) return { erro: "Sem acesso a este projeto." } as const;
  return ctx;
}

export async function salvarDadosProjetoAction(
  projetoId: string,
  input: { lei: string | null; identificacao: string; patrocinador: string },
): Promise<Result> {
  const ctx = await gestaoDoProjeto(projetoId);
  if ("erro" in ctx) return { ok: false, error: ctx.erro! };
  if (input.lei && !LEIS.some((l) => l.value === input.lei)) return { ok: false, error: "Lei inválida." };
  const data = {
    lei: input.lei || null,
    identificacao: input.identificacao.trim().slice(0, 120),
    patrocinador: input.patrocinador.trim().slice(0, 200),
  };
  await prisma.prestacaoProjeto.upsert({ where: { projetoId }, create: { projetoId, ...data }, update: data });
  await writeAuditLog({ actorUserId: ctx.user.id, action: "prestacao.dados", entityType: "Projeto", entityId: projetoId, meta: data });
  revalidar(projetoId);
  return { ok: true };
}

/** Prestação de contas entregue (yyyy-mm-dd) ou `null` para desfazer. */
export async function setPrestacaoEntregueAction(projetoId: string, data: string | null): Promise<Result> {
  const ctx = await gestaoDoProjeto(projetoId);
  if ("erro" in ctx) return { ok: false, error: ctx.erro! };
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, error: "Data inválida." };
  const quando = data ? new Date(`${data}T12:00:00-03:00`) : null;
  if (quando && quando.getTime() > Date.now()) return { ok: false, error: "A entrega não pode ser no futuro." };
  await prisma.prestacaoProjeto.upsert({
    where: { projetoId },
    create: { projetoId, entregueEm: quando, entreguePor: quando ? ctx.user.id : null },
    update: { entregueEm: quando, entreguePor: quando ? ctx.user.id : null },
  });
  await writeAuditLog({ actorUserId: ctx.user.id, action: "prestacao.entregue", entityType: "Projeto", entityId: projetoId, meta: { data } });
  revalidar(projetoId);
  return { ok: true };
}

export async function salvarProdutoAction(
  projetoId: string,
  input: { id?: string; nome: string; meta: string; acaoIds: string[] },
): Promise<Result> {
  const ctx = await gestaoDoProjeto(projetoId);
  if ("erro" in ctx) return { ok: false, error: ctx.erro! };
  const nome = input.nome.trim();
  if (!nome) return { ok: false, error: "Informe o produto." };
  const doProjeto = await prisma.acao.findMany({ where: { projetoId, id: { in: input.acaoIds } }, select: { id: true } });
  const acaoIds = doProjeto.map((a) => a.id);
  const data = { nome: nome.slice(0, 200), meta: input.meta.trim().slice(0, 2000), acaoIds };
  if (input.id && !(await prisma.prestacaoProduto.findFirst({ where: { id: input.id, projetoId }, select: { id: true } }))) {
    return { ok: false, error: "Produto não encontrado." };
  }
  await prisma.$transaction(async (tx) => {
    let id = input.id;
    if (id) {
      await tx.prestacaoProduto.update({ where: { id }, data });
    } else {
      const n = await tx.prestacaoProduto.count({ where: { projetoId } });
      id = (await tx.prestacaoProduto.create({ data: { projetoId, ...data, ordem: n + 1 } })).id;
    }
    // Cada ação conta para um produto só: sai dos outros produtos do projeto.
    if (acaoIds.length) {
      const outros = await tx.prestacaoProduto.findMany({
        where: { projetoId, id: { not: id }, acaoIds: { hasSome: acaoIds } },
        select: { id: true, acaoIds: true },
      });
      for (const o of outros) {
        await tx.prestacaoProduto.update({ where: { id: o.id }, data: { acaoIds: o.acaoIds.filter((x) => !acaoIds.includes(x)) } });
      }
    }
  });
  await writeAuditLog({ actorUserId: ctx.user.id, action: "prestacao.produto", entityType: "Projeto", entityId: projetoId, meta: data });
  revalidar(projetoId);
  return { ok: true };
}

export async function removerProdutoAction(projetoId: string, produtoId: string): Promise<Result> {
  const ctx = await gestaoDoProjeto(projetoId);
  if ("erro" in ctx) return { ok: false, error: ctx.erro! };
  const r = await prisma.prestacaoProduto.deleteMany({ where: { id: produtoId, projetoId } });
  if (!r.count) return { ok: false, error: "Produto não encontrado." };
  await writeAuditLog({ actorUserId: ctx.user.id, action: "prestacao.produto_removido", entityType: "Projeto", entityId: projetoId, meta: { produtoId } });
  revalidar(projetoId);
  return { ok: true };
}

// ── Ficha da execução ────────────────────────────────────────────────────

const NUMEROS = [
  { chave: "inscritos", rotulo: "Inscritos" },
  { chave: "selecionados", rotulo: "Selecionados" },
  { chave: "participantes", rotulo: "Participantes" },
  { chave: "pcds", rotulo: "PCDs participantes" },
  { chave: "certificados", rotulo: "Certificados" },
] as const;

async function agendaVisivel(agendaId: string, scope: Awaited<ReturnType<typeof resolveDataScope>>) {
  const g = await prisma.acaoAgenda.findUnique({
    where: { id: agendaId },
    select: {
      id: true,
      titulo: true,
      data: true,
      dataFim: true,
      online: true,
      cidade: true,
      uf: true,
      territorio: { select: { nome: true, cidade: true, estado: true } },
      acao: {
        select: {
          id: true,
          nome: true,
          projetoId: true,
          tipo: { select: { nome: true } },
          _count: { select: { agenda: true } },
        },
      },
    },
  });
  if (!g) return null;
  const projeto = await projetoVisivel(g.acao.projetoId, scope);
  return projeto ? { g, projeto } : null;
}

/** Números da ação a partir das inscrições (importação e formulários). */
async function numerosDaAcao(acaoId: string): Promise<Record<(typeof NUMEROS)[number]["chave"], number>> {
  const rows = await prisma.inscricao.findMany({
    where: { idAcao: acaoId },
    select: { selecionados: true, participantes: true, certificado: true, possuiDeficiencia: true },
  });
  const pcd = (s: string) => {
    const t = s.trim().toLowerCase();
    return Boolean(t) && !t.startsWith("n");
  };
  return {
    inscritos: rows.length,
    selecionados: rows.filter((r) => r.selecionados === 1).length,
    participantes: rows.filter((r) => r.participantes === 1).length,
    pcds: rows.filter((r) => r.participantes === 1 && pcd(r.possuiDeficiencia)).length,
    certificados: rows.filter((r) => r.certificado === 1).length,
  };
}

/** Perfil das inscrições da ação, por rótulo (para sugerir os grupos atendidos). */
async function perfilDaAcao(acaoId: string): Promise<PerfilResumo | null> {
  const socio = await aggregateSocio({ idAcao: acaoId });
  if (!socio.total) return null;
  const mapa = (b: Array<{ label: string; count: number }>) => Object.fromEntries(b.map((x) => [x.label, x.count]));
  return {
    total: socio.total,
    genero: mapa(socio.genero),
    etnia: mapa(socio.etnia),
    idade: mapa(socio.idade),
    pcd: socio.deficienca.filter((x) => /^sim/i.test(x.label)).reduce((acc, x) => acc + x.count, 0),
  };
}

/**
 * Contexto das sugestões: datas, participantes, responsáveis, perfil e o que já
 * foi usado em cada campo nas outras fichas (mesma ação, depois mesma cidade,
 * depois o resto).
 */
async function contextoSugestoes(p: {
  agendaId: string;
  acaoId: string;
  cidade: string;
  uf: string;
  inicio: Date;
  fim: Date | null;
  participantes: number;
  responsaveis: string[];
  campos: CampoDTO[];
}): Promise<ContextoSugestaoDTO> {
  const comHistorico = p.campos.filter((c) => c.sugestao === "HISTORICO" || c.sugestao === "RESPONSAVEIS" || c.tipo === "ENDERECO");
  const historico: Record<string, string[]> = {};
  const locais: Record<string, Endereco[]> = {};
  if (comHistorico.length) {
    const outras = await prisma.prestacaoFicha.findMany({
      where: { agendaId: { not: p.agendaId } },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: { valores: true, agenda: { select: { acaoId: true, cidade: true } } },
    });
    const peso = (o: (typeof outras)[number]) => (o.agenda.acaoId === p.acaoId ? 0 : o.agenda.cidade === p.cidade ? 1 : 2);
    const ordenadas = [...outras].sort((a, b) => peso(a) - peso(b));
    for (const c of comHistorico) {
      if (c.tipo === "ENDERECO") {
        const vistos = new Map<string, Endereco>();
        for (const o of ordenadas) {
          const v = comoValores(o.valores)[c.chave]?.v;
          if (v && typeof v === "object" && !Array.isArray(v)) {
            const chave = enderecoLabel(v).toLowerCase();
            if (chave && !vistos.has(chave)) vistos.set(chave, v);
          }
          if (vistos.size >= 8) break;
        }
        locais[c.chave] = [...vistos.values()];
        continue;
      }
      const vistos = new Set<string>();
      for (const o of ordenadas) {
        const v = comoValores(o.valores)[c.chave]?.v;
        // Listas de nomes contam nome a nome.
        for (const x of Array.isArray(v) ? v : [v]) {
          if (typeof x === "string" && x.trim() && !vistos.has(x.trim())) vistos.add(x.trim());
        }
        if (vistos.size >= 12) break;
      }
      historico[c.chave] = [...vistos];
    }
  }
  return {
    hoje: new Date().toISOString().slice(0, 10),
    inicio: isoDia(p.inicio)!,
    fim: isoDia(p.fim),
    participantes: p.participantes,
    responsaveis: [...new Set(p.responsaveis)],
    perfil: p.campos.some((c) => c.sugestao === "PERFIL") ? await perfilDaAcao(p.acaoId) : null,
    historico,
    locais,
    cidade: p.cidade,
    uf: p.uf,
  };
}

export async function getFichaAction(agendaId: string): Promise<FichaDTO | null> {
  const { scope, pode } = await contexto();
  const vis = await agendaVisivel(agendaId, scope);
  if (!vis) return null;
  const { g, projeto } = vis;
  const [ficha, campos, produtos, dados, numeros] = await Promise.all([
    prisma.prestacaoFicha.upsert({
      where: { agendaId },
      create: { agendaId, projetoId: projeto.id },
      update: {},
      include: { arquivos: { orderBy: [{ categoria: "asc" }, { ordem: "asc" }] } },
    }),
    prisma.prestacaoCampo.findMany({ where: { ativo: true }, orderBy: [{ equipe: "asc" }, { ordem: "asc" }] }),
    prisma.prestacaoProduto.findMany({
      where: { projetoId: projeto.id, acaoIds: { has: g.acao.id } },
      orderBy: [{ ordem: "asc" }],
      select: { nome: true },
      take: 1,
    }),
    prisma.prestacaoProjeto.findUnique({ where: { projetoId: projeto.id } }),
    numerosDaAcao(g.acao.id),
  ]);
  const valores = comoValores(ficha.valores);
  const periodo = mesesDoPeriodo(g.data, g.dataFim);
  const sistema: SistemaDTO = {
    ano: projeto.ano,
    proponente: projeto.proponente,
    projeto: projeto.nome,
    identificacao: dados?.identificacao || (projeto.pronac ? `PRONAC ${projeto.pronac}` : ""),
    acao: g.acao.nome,
    tipoAcao: g.acao.tipo.nome,
    local: g.online ? "Online" : g.territorio ? territorioLabel(g.territorio) : [g.cidade, g.uf].filter(Boolean).join(", "),
    cidadeUf: g.online ? "Online" : [g.cidade, g.uf].filter(Boolean).join("/"),
    dataInicio: isoDia(g.data)!,
    dataFim: isoDia(g.dataFim ?? g.data)!,
    meses: periodo.rotulo,
    quantidadeMeses: periodo.quantidade,
    numeros: NUMEROS.map((n) => ({
      chave: n.chave,
      rotulo: n.rotulo,
      valor: numeros[n.chave],
    })),
    numerosDaAcaoToda: g.acao._count.agenda > 1,
  };
  const camposDTO: CampoDTO[] = campos.map((c) => ({
    id: c.id,
    chave: c.chave,
    rotulo: c.rotulo,
    ajuda: c.ajuda,
    tipo: c.tipo,
    opcoes: c.opcoes,
    equipe: c.equipe,
    obrigatorio: c.obrigatorio,
    sugestao: c.sugestao,
    ordem: c.ordem,
    ativo: c.ativo,
  }));
  return {
    agendaId,
    projetoId: projeto.id,
    projetoNome: projeto.nome,
    produtoNome: produtos[0]?.nome ?? null,
    campos: camposDTO,
    valores,
    arquivos: ficha.arquivos.map(
      (a): ArquivoDTO => ({
        id: a.id,
        tipo: a.tipo === "DOCUMENTO" ? "DOCUMENTO" : "FOTO",
        categoria: a.categoria,
        descricao: a.descricao,
        ordem: a.ordem,
        noRelatorio: a.noRelatorio,
        nomeOriginal: a.nomeOriginal,
        tamanho: a.tamanho,
        url: `/api/prestacao/arquivos/${a.id}`,
        enviadoEm: a.createdAt.toISOString(),
      }),
    ),
    sistema,
    sugestoes: await contextoSugestoes({
      agendaId,
      acaoId: g.acao.id,
      cidade: g.cidade,
      uf: g.uf,
      inicio: g.data,
      fim: g.dataFim,
      participantes: sistema.numeros.find((n) => n.chave === "participantes")?.valor ?? 0,
      responsaveis: (
        await prisma.acaoResponsavel.findMany({ where: { acaoId: g.acao.id }, select: { user: { select: { name: true, email: true } } } })
      ).map((r) => r.user.name || r.user.email),
      campos: camposDTO,
    }),
    progresso: progressoFicha(camposDTO, valores),
    atualizadoEm: ficha.updatedAt.toISOString(),
    pode,
  };
}

/** Salva a parte de uma equipe na ficha (só os campos dela). */
export async function salvarFichaEquipeAction(
  agendaId: string,
  equipe: EquipePrestacao,
  entrada: Record<string, { v: string; na: boolean }>,
): Promise<Result> {
  const { user, scope, pode } = await contexto();
  if (!EQUIPES.includes(equipe)) return { ok: false, error: "Equipe inválida." };
  if (!pode[equipe]) return { ok: false, error: "Sem permissão para preencher esta parte." };
  const vis = await agendaVisivel(agendaId, scope);
  if (!vis) return { ok: false, error: "Execução não encontrada." };
  const campos = await prisma.prestacaoCampo.findMany({ where: { ativo: true, equipe } });
  const ficha = await prisma.prestacaoFicha.upsert({
    where: { agendaId },
    create: { agendaId, projetoId: vis.projeto.id },
    update: {},
  });
  const valores = { ...comoValores(ficha.valores) };
  for (const c of campos) {
    const e = entrada[c.chave];
    if (!e) continue;
    if (e.na) {
      valores[c.chave] = { na: true };
      continue;
    }
    const r = normalizarValor(c, String(e.v ?? ""));
    if (!r.ok) return { ok: false, error: r.erro };
    if (r.valor == null) delete valores[c.chave];
    else valores[c.chave] = { v: r.valor };
  }
  await prisma.prestacaoFicha.update({
    where: { agendaId },
    data: { valores: valores as Prisma.InputJsonValue, atualizadoPor: user.id },
  });
  revalidar(vis.projeto.id, agendaId);
  return { ok: true };
}

/**
 * Usuários do sistema com o nome parecido (para o campo de pessoas). Só nomes,
 * de quem está ativo; o campo continua aceitando qualquer nome digitado.
 */
export async function buscarPessoasAction(q: string): Promise<string[]> {
  await contexto();
  const termo = q.trim().slice(0, 60);
  if (termo.length < 2) return [];
  const padrao = `%${termo.replace(/[%_\\]/g, "\\$&")}%`;
  let nomes: string[] = [];
  try {
    // Usuários do MAX (cadastro do hub, mesmo banco): quem está ativo, só o nome.
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM "public"."users"
      WHERE "deactivatedAt" IS NULL AND name ILIKE ${padrao}
      ORDER BY name ASC
      LIMIT 8
    `;
    nomes = rows.map((r) => r.name);
  } catch {
    // Sem o cadastro do hub: quem já entrou no Indicadores.
    const users = await prisma.user.findMany({
      where: { deactivatedAt: null, name: { contains: termo, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: 8,
      select: { name: true },
    });
    nomes = users.map((u) => u.name);
  }
  return [...new Set(nomes.map((n) => n.trim()).filter(Boolean))];
}

// ── Fotos e documentos da ficha ──────────────────────────────────────────

async function arquivoEditavel(id: string) {
  const ctx = await contexto();
  if (!ctx.pode.PRODUCAO && !ctx.pode.COMUNICACAO && !ctx.pode.GESTAO) return { erro: "Sem permissão." } as const;
  const arq = await prisma.prestacaoArquivo.findUnique({ where: { id }, include: { ficha: { select: { agendaId: true } } } });
  if (!arq || !(await projetoVisivel(arq.projetoId, ctx.scope))) return { erro: "Arquivo não encontrado." } as const;
  return { ...ctx, arq } as const;
}

/** Categoria, descrição (legenda no relatório) e se entra no relatório. */
export async function atualizarArquivoAction(
  id: string,
  input: { categoria: string; descricao: string; noRelatorio: boolean },
): Promise<Result> {
  const r = await arquivoEditavel(id);
  if ("erro" in r) return { ok: false, error: r.erro! };
  const categorias: readonly { value: string }[] = r.arq.tipo === "DOCUMENTO" ? CATEGORIAS_DOC : CATEGORIAS_FOTO;
  if (!categorias.some((c) => c.value === input.categoria)) return { ok: false, error: "Categoria inválida." };
  await prisma.prestacaoArquivo.update({
    where: { id },
    data: { categoria: input.categoria, descricao: input.descricao.trim().slice(0, 600), noRelatorio: Boolean(input.noRelatorio) },
  });
  revalidar(r.arq.projetoId, r.arq.ficha.agendaId);
  return { ok: true };
}

/** Sobe ou desce a foto dentro da categoria (ordem no relatório). */
export async function moverArquivoAction(id: string, direcao: -1 | 1): Promise<Result> {
  const r = await arquivoEditavel(id);
  if ("erro" in r) return { ok: false, error: r.erro! };
  const irmaos = await prisma.prestacaoArquivo.findMany({
    where: { fichaId: r.arq.fichaId, categoria: r.arq.categoria, tipo: r.arq.tipo },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const i = irmaos.findIndex((x) => x.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= irmaos.length) return { ok: true };
  [irmaos[i], irmaos[j]] = [irmaos[j]!, irmaos[i]!];
  await prisma.$transaction(irmaos.map((x, k) => prisma.prestacaoArquivo.update({ where: { id: x.id }, data: { ordem: k + 1 } })));
  revalidar(r.arq.projetoId, r.arq.ficha.agendaId);
  return { ok: true };
}

export async function removerArquivoAction(id: string): Promise<Result> {
  const r = await arquivoEditavel(id);
  if ("erro" in r) return { ok: false, error: r.erro! };
  await prisma.prestacaoArquivo.delete({ where: { id } });
  // O registro sai primeiro; se o Storage falhar, sobra só um arquivo órfão.
  await removerArquivoPrivado(r.arq.storagePath).catch(() => undefined);
  await writeAuditLog({
    actorUserId: r.user.id,
    action: "prestacao.arquivo_removido",
    entityType: "PrestacaoArquivo",
    entityId: id,
    meta: { projetoId: r.arq.projetoId, nome: r.arq.nomeOriginal, categoria: r.arq.categoria },
  });
  revalidar(r.arq.projetoId, r.arq.ficha.agendaId);
  return { ok: true };
}

// ── Modelo da ficha (Configurações) ─────────────────────────────────────

export async function listCamposAction(): Promise<{ campos: CampoDTO[]; pode: boolean }> {
  const { pode } = await contexto();
  const campos = await prisma.prestacaoCampo.findMany({ orderBy: [{ equipe: "asc" }, { ordem: "asc" }] });
  return {
    campos: campos.map((c) => ({
      id: c.id,
      chave: c.chave,
      rotulo: c.rotulo,
      ajuda: c.ajuda,
      tipo: c.tipo,
      opcoes: c.opcoes,
      equipe: c.equipe,
      sugestao: c.sugestao,
      obrigatorio: c.obrigatorio,
      ordem: c.ordem,
      ativo: c.ativo,
    })),
    pode: pode.GESTAO,
  };
}

const TIPOS: TipoCampoPrestacao[] = [
  "TEXTO",
  "TEXTO_LONGO",
  "NUMERO",
  "DATA",
  "LINK",
  "OPCOES",
  "SIM_NAO",
  "MULTIPLA",
  "HORARIO",
  "PESSOAS",
  "ENDERECO",
];

function chaveDe(rotulo: string): string {
  return (
    rotulo
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50) || "campo"
  );
}

export async function salvarCampoAction(input: {
  id?: string;
  rotulo: string;
  ajuda: string;
  tipo: TipoCampoPrestacao;
  opcoes: string[];
  equipe: EquipePrestacao;
  sugestao?: string | null;
  obrigatorio: boolean;
}): Promise<Result> {
  const { user, pode } = await contexto();
  if (!pode.GESTAO) return { ok: false, error: "Só a gestão altera o modelo da ficha." };
  const rotulo = input.rotulo.trim();
  if (!rotulo) return { ok: false, error: "Informe o nome do campo." };
  if (!TIPOS.includes(input.tipo) || !EQUIPES.includes(input.equipe)) return { ok: false, error: "Dados inválidos." };
  const comOpcoes = input.tipo === "OPCOES" || input.tipo === "MULTIPLA";
  const opcoes = comOpcoes ? [...new Set(input.opcoes.map((o) => o.trim()).filter(Boolean))].slice(0, 30) : [];
  if (comOpcoes && opcoes.length < 2) return { ok: false, error: "Informe pelo menos duas opções." };
  const sugestao = input.sugestao && SUGESTOES_POR_TIPO[input.tipo].includes(input.sugestao as FonteSugestao) ? input.sugestao : null;
  const data = {
    rotulo: rotulo.slice(0, 200),
    ajuda: input.ajuda.trim().slice(0, 500),
    tipo: input.tipo,
    opcoes,
    equipe: input.equipe,
    sugestao,
    obrigatorio: Boolean(input.obrigatorio),
  };
  if (input.id) {
    // A chave não muda: as fichas já preenchidas continuam ligadas ao campo.
    await prisma.prestacaoCampo.update({ where: { id: input.id }, data });
  } else {
    let chave = chaveDe(rotulo);
    for (let i = 2; await prisma.prestacaoCampo.findUnique({ where: { chave } }); i++) chave = `${chaveDe(rotulo)}_${i}`;
    const ultima = await prisma.prestacaoCampo.aggregate({ where: { equipe: input.equipe }, _max: { ordem: true } });
    await prisma.prestacaoCampo.create({ data: { ...data, chave, ordem: (ultima._max.ordem ?? 0) + 1 } });
  }
  await writeAuditLog({ actorUserId: user.id, action: input.id ? "prestacao.campo_editar" : "prestacao.campo_criar", entityType: "PrestacaoCampo", entityId: input.id ?? rotulo, meta: data });
  revalidatePath("/dashboard/prestacao/modelo");
  return { ok: true };
}

/** Tira o campo do modelo (ou devolve). Nunca apaga: as fichas guardam os valores. */
export async function setCampoAtivoAction(id: string, ativo: boolean): Promise<Result> {
  const { user, pode } = await contexto();
  if (!pode.GESTAO) return { ok: false, error: "Só a gestão altera o modelo da ficha." };
  await prisma.prestacaoCampo.update({ where: { id }, data: { ativo } });
  await writeAuditLog({ actorUserId: user.id, action: ativo ? "prestacao.campo_restaurar" : "prestacao.campo_remover", entityType: "PrestacaoCampo", entityId: id, meta: {} });
  revalidatePath("/dashboard/prestacao/modelo");
  return { ok: true };
}

export async function moverCampoAction(id: string, direcao: -1 | 1): Promise<Result> {
  const { pode } = await contexto();
  if (!pode.GESTAO) return { ok: false, error: "Só a gestão altera o modelo da ficha." };
  const c = await prisma.prestacaoCampo.findUnique({ where: { id } });
  if (!c) return { ok: false, error: "Campo não encontrado." };
  const irmaos = await prisma.prestacaoCampo.findMany({
    where: { equipe: c.equipe, ativo: true },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const i = irmaos.findIndex((x) => x.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= irmaos.length) return { ok: true };
  [irmaos[i], irmaos[j]] = [irmaos[j]!, irmaos[i]!];
  await prisma.$transaction(irmaos.map((x, k) => prisma.prestacaoCampo.update({ where: { id: x.id }, data: { ordem: k + 1 } })));
  revalidatePath("/dashboard/prestacao/modelo");
  return { ok: true };
}
