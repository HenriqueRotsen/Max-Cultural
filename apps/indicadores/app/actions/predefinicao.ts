"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { FASES_NIVEL1, FASES_NIVEL2 } from "@/lib/acompanhamento/types";
import type { AreaTarefa, FaseTarefa, ModeloDTO, PrazoBase, UnidadeTarefa } from "@/lib/acompanhamento/types";

type Result = { ok: true } | { ok: false; error: string };

const AREAS: AreaTarefa[] = ["COMUNICACAO", "PRODUCAO"];
const BASES: Record<number, PrazoBase[]> = {
  1: ["INICIO_EXECUCAO", "FIM_EXECUCAO"],
  2: ["INICIO_ACAO", "FIM_ACAO"],
};

async function contexto() {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("acompanhamento:read")) throw new Error("Sem acesso ao acompanhamento.");
  return { user, pode: perms.has("acompanhamento:gestao") };
}

/**
 * Tarefas da pré-definição (inclusive as removidas, que continuam guardadas
 * porque projetos antigos ainda as usam) e os tipos de ação.
 */
export async function listPreDefinicaoAction(): Promise<{
  modelos: ModeloDTO[];
  tiposAcao: Array<{ id: string; nome: string }>;
  pode: boolean;
}> {
  const { pode } = await contexto();
  const [modelos, tipos] = await Promise.all([
    prisma.tarefaModelo.findMany({ orderBy: [{ area: "asc" }, { nivel: "asc" }, { ordem: "asc" }] }),
    prisma.acaoTipo.findMany({ orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
  ]);
  return {
    modelos: modelos.map((m) => ({
      id: m.id,
      area: m.area,
      nivel: m.nivel,
      fase: m.fase,
      titulo: m.titulo,
      detalhamento: m.detalhamento,
      unidade: m.unidade,
      prazoBase: m.prazoBase,
      prazoDias: m.prazoDias,
      tiposAcao: m.tiposAcao,
      ordem: m.ordem,
      ativo: m.ativo,
    })),
    tiposAcao: tipos,
    pode,
  };
}

export type ModeloInput = {
  id?: string;
  area: AreaTarefa;
  nivel: number;
  fase: FaseTarefa;
  titulo: string;
  detalhamento: string;
  unidade: UnidadeTarefa;
  prazoBase: PrazoBase | null;
  prazoDias: number | null;
  tiposAcao: string[];
};

function validar(i: ModeloInput): string | null {
  if (!AREAS.includes(i.area) || ![1, 2].includes(i.nivel)) return "Dados inválidos.";
  const fases = i.nivel === 1 ? FASES_NIVEL1 : FASES_NIVEL2;
  if (!fases.includes(i.fase)) return "Fase inválida.";
  if (!i.titulo.trim()) return "Informe o título.";
  if (i.nivel === 1 ? i.unidade !== "PROJETO" : !["ACAO", "CIDADE"].includes(i.unidade)) return "Unidade inválida.";
  if ((i.prazoBase == null) !== (i.prazoDias == null)) return "Complete o prazo ou marque sem prazo.";
  if (i.prazoDias != null && (!Number.isInteger(i.prazoDias) || Math.abs(i.prazoDias) > 730)) return "Dias do prazo inválidos.";
  if (i.prazoBase && !BASES[i.nivel]!.includes(i.prazoBase)) return "Referência do prazo inválida.";
  return null;
}

/** Cria ou edita uma tarefa da pré-definição (gestão). Vale para projetos novos. */
export async function salvarModeloAction(input: ModeloInput): Promise<Result> {
  const { user, pode } = await contexto();
  if (!pode) return { ok: false, error: "Só a gestão altera a pré-definição." };
  const erro = validar(input);
  if (erro) return { ok: false, error: erro };
  const tipos = input.nivel === 2 ? input.tiposAcao.filter(Boolean) : [];
  const data = {
    area: input.area,
    nivel: input.nivel,
    fase: input.fase,
    titulo: input.titulo.trim().slice(0, 200),
    detalhamento: input.detalhamento.trim().slice(0, 2000),
    unidade: input.unidade,
    prazoBase: input.prazoBase,
    prazoDias: input.prazoDias,
    tiposAcao: tipos,
  };
  let id = input.id;
  if (id) {
    const atual = await prisma.tarefaModelo.findUnique({ where: { id }, select: { area: true, nivel: true } });
    if (!atual) return { ok: false, error: "Tarefa não encontrada." };
    if (atual.area !== input.area || atual.nivel !== input.nivel) return { ok: false, error: "Área e nível não mudam." };
    await prisma.tarefaModelo.update({ where: { id }, data });
  } else {
    const ultima = await prisma.tarefaModelo.aggregate({
      where: { area: input.area, nivel: input.nivel },
      _max: { ordem: true },
    });
    id = (await prisma.tarefaModelo.create({ data: { ...data, ordem: (ultima._max.ordem ?? 0) + 1 } })).id;
  }
  await writeAuditLog({
    actorUserId: user.id,
    action: input.id ? "predefinicao.editar" : "predefinicao.criar",
    entityType: "TarefaModelo",
    entityId: id,
    meta: data,
  });
  revalidatePath("/dashboard/acompanhamento/pre-definicao");
  return { ok: true };
}

/**
 * Tira da pré-definição (ou devolve). Nunca apaga: projetos que já começaram
 * guardaram uma cópia que aponta para esta tarefa.
 */
export async function setModeloAtivoAction(id: string, ativo: boolean): Promise<Result> {
  const { user, pode } = await contexto();
  if (!pode) return { ok: false, error: "Só a gestão altera a pré-definição." };
  const m = await prisma.tarefaModelo.findUnique({ where: { id }, select: { titulo: true } });
  if (!m) return { ok: false, error: "Tarefa não encontrada." };
  await prisma.tarefaModelo.update({ where: { id }, data: { ativo } });
  await writeAuditLog({
    actorUserId: user.id,
    action: ativo ? "predefinicao.restaurar" : "predefinicao.remover",
    entityType: "TarefaModelo",
    entityId: id,
    meta: { titulo: m.titulo },
  });
  revalidatePath("/dashboard/acompanhamento/pre-definicao");
  return { ok: true };
}

/** Sobe ou desce a tarefa dentro da fase. */
export async function moverModeloAction(id: string, direcao: -1 | 1): Promise<Result> {
  const { pode } = await contexto();
  if (!pode) return { ok: false, error: "Só a gestão altera a pré-definição." };
  const m = await prisma.tarefaModelo.findUnique({ where: { id } });
  if (!m) return { ok: false, error: "Tarefa não encontrada." };
  const irmas = await prisma.tarefaModelo.findMany({
    where: { area: m.area, nivel: m.nivel, fase: m.fase, ativo: true },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const i = irmas.findIndex((x) => x.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= irmas.length) return { ok: true };
  [irmas[i], irmas[j]] = [irmas[j]!, irmas[i]!];
  // Renumera a fase toda (ordem única e sem buracos), mantendo a fase depois das anteriores.
  const base = Math.min(
    ...(await prisma.tarefaModelo.findMany({
      where: { id: { in: irmas.map((x) => x.id) } },
      select: { ordem: true },
    })).map((x) => x.ordem),
  );
  await prisma.$transaction(
    irmas.map((x, k) => prisma.tarefaModelo.update({ where: { id: x.id }, data: { ordem: base + k } })),
  );
  revalidatePath("/dashboard/acompanhamento/pre-definicao");
  return { ok: true };
}
