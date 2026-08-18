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
  oficinas: Array<{ idOficina: string; nomeOficina: string }>;
  proponentes: string[];
  pronacs: string[];
  anos: string[];
};

export type AnaliseGeoFilterOptions = {
  projetos: Array<{ idProjeto: string; nomeProjeto: string }>;
  oficinas: Array<{ idOficina: string; nomeOficina: string }>;
  estados: string[];
  cidades: string[];
  territorios: string[];
};

/**
 * Opções de filtro da Base: vem de Projeto/Oficina (+ anos/pronac/proponente),
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
              ...(scope.oficinaIds?.length
                ? [{ oficinas: { some: { id: { in: scope.oficinaIds } } } }]
                : []),
            ],
          };

    // LIMITED sem nenhum id → vazio
    if (
      scope.mode !== "ALL" &&
      !(
        (scope.projetoIds?.length ?? 0) ||
        (scope.contextoIds?.length ?? 0) ||
        (scope.oficinaIds?.length ?? 0)
      )
    ) {
      return {
        projetos: [],
        oficinas: [],
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
    const oficinaWhere: Prisma.OficinaWhereInput =
      scope.mode === "ALL"
        ? {}
        : scope.oficinaIds?.length
          ? {
              OR: [
                { id: { in: scope.oficinaIds } },
                ...(projetoIds.length
                  ? [{ projetoId: { in: projetoIds } }]
                  : []),
              ],
            }
          : projetoIds.length
            ? { projetoId: { in: projetoIds } }
            : { id: "__none__" };

    const oficinas = await prisma.oficina.findMany({
      where: oficinaWhere,
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
      oficinas: oficinas.map((o) => ({
        idOficina: o.id,
        nomeOficina: o.nome || o.id,
      })),
      proponentes,
      pronacs,
      anos,
    };
  },
);

/** Filtros geográficos da Análise (groupBy leve + projetos/oficinas). */
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
      oficinas: base.oficinas,
      estados: estados.map((e) => e.estado).filter(Boolean),
      cidades: cidades.map((c) => c.cidade).filter(Boolean),
      territorios: territorios.map((t) => t.territorio).filter(Boolean),
    };
  },
);
