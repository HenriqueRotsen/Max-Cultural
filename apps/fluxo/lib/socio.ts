import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SocioBucket = {
  label: string;
  count: number;
  pct: number;
};

export type SocioBreakdown = {
  total: number;
  genero: SocioBucket[];
  etnia: SocioBucket[];
  escolaridade: SocioBucket[];
  idade: SocioBucket[];
  deficienca: SocioBucket[];
};

function ageBand(age: number): string {
  if (!Number.isFinite(age) || age <= 0) return "Não informado";
  if (age < 15) return "Até 14";
  if (age < 18) return "15–17";
  if (age < 30) return "18–29";
  if (age < 45) return "30–44";
  if (age < 60) return "45–59";
  return "60+";
}

function toBuckets(
  counts: Map<string, number>,
  total: number,
): SocioBucket[] {
  return [...counts.entries()]
    .map(([label, count]) => ({
      label: label || "Não informado",
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

function normalizeDeficiencia(raw: string): string {
  const def = raw.trim();
  if (!def) return "Não informado";
  if (/^n[aã]o/i.test(def) || def.toLowerCase() === "nao") return "Não";
  if (/^sim/i.test(def)) return "Sim";
  return def;
}

/**
 * Agrega perfil sociodemográfico via groupBy (sem carregar todas as linhas).
 */
export async function aggregateSocio(
  where: Prisma.InscricaoWhereInput = {},
): Promise<SocioBreakdown> {
  const [total, byGenero, byEtnia, byEscolaridade, byIdade, byDef] =
    await Promise.all([
      prisma.inscricao.count({ where }),
      prisma.inscricao.groupBy({
        by: ["genero"],
        where,
        _count: { _all: true },
      }),
      prisma.inscricao.groupBy({
        by: ["etnia"],
        where,
        _count: { _all: true },
      }),
      prisma.inscricao.groupBy({
        by: ["escolaridade"],
        where,
        _count: { _all: true },
      }),
      prisma.inscricao.groupBy({
        by: ["idadeAtual"],
        where,
        _count: { _all: true },
      }),
      prisma.inscricao.groupBy({
        by: ["possuiDeficiencia"],
        where,
        _count: { _all: true },
      }),
    ]);

  const genero = new Map<string, number>();
  for (const g of byGenero) {
    const k = g.genero.trim() || "Não informado";
    genero.set(k, (genero.get(k) ?? 0) + g._count._all);
  }

  const etnia = new Map<string, number>();
  for (const g of byEtnia) {
    const k = g.etnia.trim() || "Não informado";
    etnia.set(k, (etnia.get(k) ?? 0) + g._count._all);
  }

  const escolaridade = new Map<string, number>();
  for (const g of byEscolaridade) {
    const k = g.escolaridade.trim() || "Não informado";
    escolaridade.set(k, (escolaridade.get(k) ?? 0) + g._count._all);
  }

  const idade = new Map<string, number>();
  for (const g of byIdade) {
    const band = ageBand(g.idadeAtual ?? 0);
    idade.set(band, (idade.get(band) ?? 0) + g._count._all);
  }

  const deficienca = new Map<string, number>();
  for (const g of byDef) {
    const k = normalizeDeficiencia(g.possuiDeficiencia);
    deficienca.set(k, (deficienca.get(k) ?? 0) + g._count._all);
  }

  return {
    total,
    genero: toBuckets(genero, total),
    etnia: toBuckets(etnia, total),
    escolaridade: toBuckets(escolaridade, total),
    idade: toBuckets(idade, total),
    deficienca: toBuckets(deficienca, total),
  };
}
