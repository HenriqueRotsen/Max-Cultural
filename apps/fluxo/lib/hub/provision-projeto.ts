import { prisma } from "@/lib/prisma";
import { nextIdProjeto } from "@/lib/ids";
import { extractProjectYear, normalizeAnoProjeto } from "@/lib/normalize";
import {
  ensureContextoByNome,
  resolveContextoForProjetoNome,
  type ContextoResolveResult,
} from "@/lib/hub/resolve-contexto";

export type ProvisionOrigemProjetoInput = {
  pronac: string;
  nome: string;
  proponente?: string;
  ano?: string;
  /** Contexto existente escolhido pelo usuário. */
  contextoId?: string;
  /** Nome para criar ou confirmar contexto novo. */
  contextoNome?: string;
  /** Cria contexto quando não houver match automático. */
  createContexto?: boolean;
  /** Tenta resolver pelo stem do nome do projeto (padrão). */
  autoMatchContexto?: boolean;
};

export type ProvisionOrigemProjetoResult = {
  created: boolean;
  projeto: {
    id: string;
    nome: string;
    pronac: string;
    proponente: string;
    ano: string;
    contextoId: string;
    contextoNome: string;
  };
  contextoCreated: boolean;
};

export class ProvisionNeedsContextoError extends Error {
  readonly code = "NEEDS_CONTEXTO" as const;
  constructor(public resolve: ContextoResolveResult) {
    super("Vincule ou cadastre um contexto para este projeto.");
    this.name = "ProvisionNeedsContextoError";
  }
}

async function resolveContextoId(
  input: ProvisionOrigemProjetoInput,
): Promise<{ contextoId: string; contextoNome: string; contextoCreated: boolean }> {
  if (input.contextoId?.trim()) {
    const ctx = await prisma.contexto.findUnique({
      where: { id: input.contextoId.trim() },
      select: { id: true, nome: true },
    });
    if (!ctx) throw new Error("Contexto não encontrado.");
    return { contextoId: ctx.id, contextoNome: ctx.nome, contextoCreated: false };
  }

  const autoMatch = input.autoMatchContexto !== false;
  const resolved = await resolveContextoForProjetoNome(input.nome);

  if (autoMatch && resolved.status === "matched" && resolved.contexto) {
    return {
      contextoId: resolved.contexto.id,
      contextoNome: resolved.contexto.nome,
      contextoCreated: false,
    };
  }

  if (resolved.status === "ambiguous") {
    throw new ProvisionNeedsContextoError(resolved);
  }

  const nomeNovo = (input.contextoNome ?? resolved.suggestedNome).trim();
  if (input.createContexto && nomeNovo) {
    const before = await prisma.contexto.findFirst({
      where: { nome: nomeNovo },
      select: { id: true },
    });
    const ctx = await ensureContextoByNome(nomeNovo);
    return {
      contextoId: ctx.id,
      contextoNome: ctx.nome,
      contextoCreated: !before,
    };
  }

  throw new ProvisionNeedsContextoError(resolved);
}

/**
 * Cria ou atualiza um projeto Fluxo a partir do planejamento Origem.
 * Idempotente por PRONAC. Contexto: match automático pelo stem do nome ou escolha manual.
 */
export async function provisionProjetoFromOrigem(
  input: ProvisionOrigemProjetoInput,
): Promise<ProvisionOrigemProjetoResult> {
  const pronac = input.pronac.trim();
  const nome = input.nome.trim() || pronac;
  const proponente = (input.proponente ?? "").trim();
  const ano = normalizeAnoProjeto(input.ano ?? extractProjectYear(nome));

  if (!pronac) throw new Error("PRONAC inválido");

  const { contextoId, contextoNome, contextoCreated } =
    await resolveContextoId(input);

  const existing = await prisma.projeto.findFirst({
    where: { pronac },
    orderBy: { createdAt: "desc" },
    include: { contexto: { select: { nome: true } } },
  });

  if (existing) {
    const needsUpdate =
      existing.nome !== nome ||
      existing.proponente !== proponente ||
      (ano && existing.ano !== ano) ||
      existing.contextoId !== contextoId;

    const updated = needsUpdate
      ? await prisma.projeto.update({
          where: { id: existing.id },
          data: {
            nome,
            proponente,
            contextoId,
            ...(ano ? { ano } : {}),
          },
          include: { contexto: { select: { nome: true } } },
        })
      : existing;

    return {
      created: false,
      contextoCreated,
      projeto: {
        id: updated.id,
        nome: updated.nome,
        pronac: updated.pronac,
        proponente: updated.proponente,
        ano: updated.ano,
        contextoId: updated.contextoId,
        contextoNome: updated.contexto.nome,
      },
    };
  }

  const id = await nextIdProjeto();
  const created = await prisma.projeto.create({
    data: {
      id,
      nome,
      pronac,
      proponente,
      ano,
      contextoId,
    },
    include: { contexto: { select: { nome: true } } },
  });

  return {
    created: true,
    contextoCreated,
    projeto: {
      id: created.id,
      nome: created.nome,
      pronac: created.pronac,
      proponente: created.proponente,
      ano: created.ano,
      contextoId: created.contextoId,
      contextoNome: created.contexto.nome,
    },
  };
}

export { resolveContextoForProjetoNome, type ContextoResolveResult };
