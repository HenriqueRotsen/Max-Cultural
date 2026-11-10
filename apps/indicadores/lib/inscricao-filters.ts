import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  inscricaoWhereFromScope,
  resolveDataScope,
} from "@/lib/data-scope";
import { extractProjectYear } from "@/lib/normalize";
import { nomeCanonico, proponenteKey } from "@/lib/proponente";

/**
 * Junta grafias do mesmo proponente ("… LTDA", com CNPJ, apelidos confirmados)
 * numa opção só, com o nome mais completo. `value` = nome exibido.
 */
export function agruparProponentes<T extends { nome: string; n: number }>(
  lista: T[],
): Array<{ value: string; label: string; n: number }> {
  const porKey = new Map<string, Array<{ nome: string; usos: number }>>();
  for (const x of lista) {
    const nome = x.nome.trim();
    if (!nome) continue;
    const key = proponenteKey(nome) || nome.toLowerCase();
    const l = porKey.get(key) ?? [];
    l.push({ nome, usos: x.n });
    porKey.set(key, l);
  }
  return [...porKey.values()]
    .map((variantes) => {
      const nome = nomeCanonico(variantes);
      return { value: nome, label: nome, n: variantes.reduce((s, v) => s + v.usos, 0) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/**
 * Todas as grafias gravadas do proponente escolhido no filtro (projetos +
 * inscrições), para o filtro achar "Vivas Cultura e Esporte" e "… LTDA" juntos.
 */
export const proponenteVariantes = cache(
  async (userId: string, nome: string): Promise<string[]> => {
    const key = proponenteKey(nome);
    if (!key) return [nome];
    const scope = await resolveDataScope(userId);
    const [deInscricoes, deProjetos] = await Promise.all([
      prisma.inscricao.groupBy({ by: ["proponente"], where: inscricaoWhereFromScope(scope) }),
      prisma.projeto.findMany({ select: { proponente: true }, distinct: ["proponente"] }),
    ]);
    const nomes = new Set<string>([nome]);
    for (const n of [
      ...deInscricoes.map((g) => g.proponente),
      ...deProjetos.map((p) => p.proponente),
    ]) {
      if (n && proponenteKey(n) === key) nomes.add(n);
    }
    return [...nomes];
  },
);

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

    const proponentes = agruparProponentes(
      projetos.map((p) => ({ nome: p.proponente, n: 1 })),
    ).map((o) => o.value);
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

/**
 * Nome a gravar no projeto: se outro projeto já tem o mesmo proponente com
 * outra grafia, usa o nome mais completo entre elas (evita novas duplicatas).
 */
export async function proponenteParaGravar(nome: string, exceptProjetoId?: string): Promise<string> {
  const limpo = nome.trim().replace(/\s+/g, " ");
  const key = proponenteKey(limpo);
  if (!key) return limpo;
  const outros = await prisma.projeto.groupBy({
    by: ["proponente"],
    where: exceptProjetoId ? { id: { not: exceptProjetoId } } : undefined,
    _count: { _all: true },
  });
  const variantes = outros
    .filter((g) => g.proponente.trim() && proponenteKey(g.proponente) === key)
    .map((g) => ({ nome: g.proponente, usos: g._count._all }));
  if (!variantes.length) return limpo;
  return nomeCanonico([...variantes, { nome: limpo, usos: 1 }]);
}
