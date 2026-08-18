"use server";

import { prisma } from "@/lib/prisma";
import { extractProjectYear } from "@/lib/normalize";
import { programaStem } from "@/lib/programa";
import { aggregateSocio, type SocioBreakdown } from "@/lib/socio";

export type ProgramaEdicao = {
  id_projeto: string;
  Nome_projeto: string;
  ano: string;
  href: string;
  inscritos: number;
  selecionados: number;
  participantes: number;
  certificados: number;
  oficinas: number;
};

/** Item da lista “Programas / edições” (= Contexto com projetos filhos) */
export type ProgramaListItem = {
  id: string;
  stem: string;
  label: string;
  href: string;
  edicoes: number;
  inscritos: number;
  anos: string[];
};

export type ProgramaPanorama = {
  id: string;
  stem: string;
  label: string;
  edicoes: ProgramaEdicao[];
  totais: {
    inscritos: number;
    selecionados: number;
    participantes: number;
    certificados: number;
    edicoes: number;
  };
  socio: SocioBreakdown;
};

export async function listContextosPanoramaAction(): Promise<ProgramaListItem[]> {
  const contextos = await prisma.contexto.findMany({
    include: {
      projetos: {
        select: {
          id: true,
          ano: true,
        },
      },
    },
    orderBy: { nome: "asc" },
  });

  if (contextos.length === 0) return [];

  const projetoIds = contextos.flatMap((c) => c.projetos.map((p) => p.id));
  const counts =
    projetoIds.length === 0
      ? []
      : await prisma.inscricao.groupBy({
          by: ["idProjeto"],
          where: { idProjeto: { in: projetoIds } },
          _sum: { inscritos: true },
        });
  const inscByProjeto = new Map(
    counts.map((c) => [c.idProjeto, c._sum.inscritos ?? 0]),
  );

  return contextos
    .map((c) => {
      const anos = [
        ...new Set(c.projetos.map((p) => p.ano).filter(Boolean)),
      ].sort();
      const inscritos = c.projetos.reduce(
        (s, p) => s + (inscByProjeto.get(p.id) ?? 0),
        0,
      );
      const label = c.nome.trim() || "(sem nome)";
      return {
        id: c.id,
        stem: programaStem(c.nome) || c.id,
        label,
        href: `/contexto/${encodeURIComponent(c.id)}`,
        edicoes: c.projetos.length,
        inscritos,
        anos,
      };
    })
    .filter((p) => p.edicoes >= 1)
    .sort((a, b) => b.inscritos - a.inscritos);
}

/** @deprecated use listContextosPanoramaAction */
export async function listProgramasAction(): Promise<ProgramaListItem[]> {
  return listContextosPanoramaAction();
}

export async function getContextoPanoramaAction(
  idRaw: string,
): Promise<
  { ok: true; data: ProgramaPanorama } | { ok: false; error: string }
> {
  const id = decodeURIComponent(idRaw).trim();
  if (!id) return { ok: false, error: "Contexto inválido." };

  const contexto = await prisma.contexto.findUnique({
    where: { id },
    include: {
      projetos: {
        include: {
          oficinas: { select: { id: true } },
        },
        orderBy: [{ ano: "asc" }, { nome: "asc" }],
      },
    },
  });

  if (!contexto) return { ok: false, error: "Contexto não encontrado." };

  const projetoIds = contexto.projetos.map((p) => p.id);
  const aggregates =
    projetoIds.length === 0
      ? []
      : await prisma.inscricao.groupBy({
          by: ["idProjeto"],
          where: { idProjeto: { in: projetoIds } },
          _sum: {
            inscritos: true,
            selecionados: true,
            participantes: true,
            certificado: true,
          },
        });
  const byId = new Map(aggregates.map((a) => [a.idProjeto, a]));

  const edicoes: ProgramaEdicao[] = contexto.projetos.map((p) => {
    const a = byId.get(p.id);
    const ano =
      extractProjectYear(p.ano) || p.ano || "—";
    return {
      id_projeto: p.id,
      Nome_projeto: p.nome,
      ano,
      href: `/projeto/${encodeURIComponent(p.id)}`,
      inscritos: a?._sum.inscritos ?? 0,
      selecionados: a?._sum.selecionados ?? 0,
      participantes: a?._sum.participantes ?? 0,
      certificados: a?._sum.certificado ?? 0,
      oficinas: p.oficinas.length,
    };
  });

  const socio =
    projetoIds.length === 0
      ? {
          total: 0,
          genero: [],
          etnia: [],
          escolaridade: [],
          idade: [],
          deficienca: [],
        }
      : await aggregateSocio({ idProjeto: { in: projetoIds } });

  const totais = edicoes.reduce(
    (acc, e) => {
      acc.inscritos += e.inscritos;
      acc.selecionados += e.selecionados;
      acc.participantes += e.participantes;
      acc.certificados += e.certificados;
      return acc;
    },
    {
      inscritos: 0,
      selecionados: 0,
      participantes: 0,
      certificados: 0,
      edicoes: edicoes.length,
    },
  );

  const label = contexto.nome.trim() || "(sem nome)";

  return {
    ok: true,
    data: {
      id: contexto.id,
      stem: programaStem(contexto.nome) || contexto.id,
      label,
      edicoes,
      totais,
      socio,
    },
  };
}

/** Resolve panorama por stem legado (redirect /programa/[stem]). */
export async function getProgramaPanoramaAction(
  stemRaw: string,
): Promise<
  { ok: true; data: ProgramaPanorama } | { ok: false; error: string }
> {
  const stem = decodeURIComponent(stemRaw).trim();
  if (!stem) return { ok: false, error: "Programa inválido." };

  const contextos = await prisma.contexto.findMany({
    select: { id: true, nome: true },
  });
  const match = contextos.find(
    (c) => programaStem(c.nome) === stem || c.id === stem,
  );
  if (!match) return { ok: false, error: "Programa não encontrado." };
  return getContextoPanoramaAction(match.id);
}

export async function getContextoForProjeto(
  idProjeto: string,
): Promise<{ id: string; label: string; siblings: number } | null> {
  const projeto = await prisma.projeto.findUnique({
    where: { id: idProjeto },
    include: {
      contexto: { select: { id: true, nome: true } },
      _count: { select: { oficinas: true } },
    },
  });
  if (!projeto) {
    // Fallback: inscrição denormalizada
    const sample = await prisma.inscricao.findFirst({
      where: { idProjeto },
      select: { contextoId: true, nomeContexto: true },
    });
    if (!sample?.contextoId) return null;
    const siblings = await prisma.projeto.count({
      where: { contextoId: sample.contextoId },
    });
    return {
      id: sample.contextoId,
      label: sample.nomeContexto.trim() || "(sem nome)",
      siblings,
    };
  }

  const siblings = await prisma.projeto.count({
    where: { contextoId: projeto.contextoId },
  });

  return {
    id: projeto.contexto.id,
    label: projeto.contexto.nome.trim() || "(sem nome)",
    siblings,
  };
}

/** @deprecated use getContextoForProjeto */
export async function getProgramaStemForProjeto(
  idProjeto: string,
): Promise<{ stem: string; siblings: number } | null> {
  const ctx = await getContextoForProjeto(idProjeto);
  if (!ctx) return null;
  return { stem: ctx.id, siblings: ctx.siblings };
}
