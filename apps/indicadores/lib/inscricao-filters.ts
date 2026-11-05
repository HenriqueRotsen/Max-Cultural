import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  inscricaoWhereFromScope,
  resolveDataScope,
} from "@/lib/data-scope";
import { extractProjectYear } from "@/lib/normalize";

export type InscricaoFilterOptions = {
  projetos: Array<{ idProjeto: string; nomeProjeto: string }>;
  acoes: Array<{ idAcao: string; nomeAcao: string }>;
  proponentes: string[];
  pronacs: string[];
  anos: string[];
};

export type AnaliseGeoFilterOptions = {
  projetos: Array<{ idProjeto: string; nomeProjeto: string }>;
  acoes: Array<{ idAcao: string; nomeAcao: string }>;
  estados: string[];
  cidades: string[];
  territorios: string[];
};

/**
 * Opções de filtro da Base: vem de Projeto/Ação (+ anos/pronac/proponente),
 * sem distinct pesado em todas as inscrições.
 */
export const getInscricaoFilterOptions = cache(
  async (userId: string): Promise<InscricaoFilterOptions> => {
    const scope = await resolveDataScope(userId);

    const projetoWhere: Prisma.ProjetoWhereInput =
      scope.mode === "ALL"
        ? {}
        : {
            OR: [
              ...(scope.projetoIds?.length
                ? [{ id: { in: scope.projetoIds } }]
                : []),
              ...(scope.contextoIds?.length
                ? [{ contextoId: { in: scope.contextoIds } }]
                : []),
              ...(scope.acaoIds?.length
                ? [{ acoes: { some: { id: { in: scope.acaoIds } } } }]
                : []),
            ],
          };

    // LIMITED sem nenhum id → vazio
    if (
      scope.mode !== "ALL" &&
      !(
        (scope.projetoIds?.length ?? 0) ||
        (scope.contextoIds?.length ?? 0) ||
        (scope.acaoIds?.length ?? 0)
      )
    ) {
      return {
        projetos: [],
        acoes: [],
        proponentes: [],
        pronacs: [],
        anos: [],
      };
    }

    const hasOr =
      scope.mode === "ALL" ||
      Object.keys(projetoWhere).length === 0 ||
      ((projetoWhere as { OR?: unknown[] }).OR?.length ?? 0) > 0;

    const projetos = hasOr
      ? await prisma.projeto.findMany({
          where: scope.mode === "ALL" ? {} : projetoWhere,
          select: {
            id: true,
            nome: true,
            proponente: true,
            pronac: true,
            ano: true,
          },
          orderBy: { nome: "asc" },
        })
      : [];

    const projetoIds = projetos.map((p) => p.id);
    const acaoWhere: Prisma.AcaoWhereInput =
      scope.mode === "ALL"
        ? {}
        : scope.acaoIds?.length
          ? {
              OR: [
                { id: { in: scope.acaoIds } },
                ...(projetoIds.length
                  ? [{ projetoId: { in: projetoIds } }]
                  : []),
              ],
            }
          : projetoIds.length
            ? { projetoId: { in: projetoIds } }
            : { id: "__none__" };

    const acoes = await prisma.acao.findMany({
      where: acaoWhere,
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });

    const proponentes = [
      ...new Set(projetos.map((p) => p.proponente.trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const pronacs = [
      ...new Set(projetos.map((p) => p.pronac.trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const anos = [
      ...new Set(
        projetos
          .map((p) => extractProjectYear(p.ano) || p.ano.trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));

    return {
      projetos: projetos.map((p) => ({
        idProjeto: p.id,
        nomeProjeto: p.nome || p.id,
      })),
      acoes: acoes.map((o) => ({
        idAcao: o.id,
        nomeAcao: o.nome || o.id,
      })),
      proponentes,
      pronacs,
      anos,
    };
  },
);

/** Filtros geográficos da Análise (groupBy leve + projetos/ações). */
export const getAnaliseFilterOptions = cache(
  async (userId: string): Promise<AnaliseGeoFilterOptions> => {
    const scope = await resolveDataScope(userId);
    const scopeWhere = inscricaoWhereFromScope(scope);
    const base = await getInscricaoFilterOptions(userId);

    const [estados, cidades, territorios] = await Promise.all([
      prisma.inscricao.groupBy({
        by: ["estado"],
        where: scopeWhere,
        orderBy: { estado: "asc" },
      }),
      prisma.inscricao.groupBy({
        by: ["cidade"],
        where: scopeWhere,
        orderBy: { cidade: "asc" },
      }),
      prisma.inscricao.groupBy({
        by: ["territorio"],
        where: scopeWhere,
        orderBy: { territorio: "asc" },
      }),
    ]);

    return {
      projetos: base.projetos,
      acoes: base.acoes,
      estados: estados.map((e) => e.estado).filter(Boolean),
      cidades: cidades.map((c) => c.cidade).filter(Boolean),
      territorios: territorios.map((t) => t.territorio).filter(Boolean),
    };
  },
);
