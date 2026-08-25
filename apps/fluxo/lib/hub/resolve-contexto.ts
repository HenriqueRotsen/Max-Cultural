import { prisma } from "@/lib/prisma";
import { programaDisplayName, programaStem } from "@/lib/programa";

export type ContextoResolveMatch = { id: string; nome: string };

export type ContextoResolveResult = {
  stem: string;
  suggestedNome: string;
  status: "matched" | "ambiguous" | "none";
  contexto: ContextoResolveMatch | null;
  candidates: ContextoResolveMatch[];
};

export async function resolveContextoForProjetoNome(
  nomeProjeto: string,
): Promise<ContextoResolveResult> {
  const stem = programaStem(nomeProjeto);
  const suggestedNome = programaDisplayName(nomeProjeto);

  const contextos = await prisma.contexto.findMany({
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  const candidates = contextos.filter(
    (c) => programaStem(c.nome) === stem && stem.length > 0,
  );

  if (candidates.length === 1) {
    return {
      stem,
      suggestedNome,
      status: "matched",
      contexto: candidates[0]!,
      candidates: [candidates[0]!],
    };
  }

  if (candidates.length > 1) {
    return {
      stem,
      suggestedNome,
      status: "ambiguous",
      contexto: null,
      candidates,
    };
  }

  return {
    stem,
    suggestedNome,
    status: "none",
    contexto: null,
    candidates: [],
  };
}

export async function ensureContextoByNome(nome: string): Promise<ContextoResolveMatch> {
  const trimmed = nome.trim();
  if (!trimmed) throw new Error("Nome do contexto inválido");

  const stem = programaStem(trimmed);
  const existing = await prisma.contexto.findMany({
    select: { id: true, nome: true },
  });
  const match = existing.find((c) => programaStem(c.nome) === stem && stem.length > 0);
  if (match) return match;

  const created = await prisma.contexto.create({
    data: { nome: trimmed },
    select: { id: true, nome: true },
  });
  return created;
}
