"use server";

import { prisma } from "@/lib/prisma";
import { normalizeUf, normalizeAddressLine } from "@/lib/normalize";
import {
  matchesSlug,
  buildTerritorioPath,
  slugifyPart,
} from "@/lib/territorio-slug";
import {
  isOnlineRow,
  isOnlineTerritorio,
  onlineLabel,
} from "@/lib/territorio-online";
import { isKnownMunicipio, lookupUfByCidade } from "@/lib/municipio-uf";
import {
  ensureCityCoords,
  geoCacheKey,
  resolveGeoUf,
  type CityCoords,
} from "@/lib/geo";
import { lookupMunicipioCoords } from "@/lib/municipio-coords";
import { formatCellDisplay } from "@/lib/validate";
import { aggregateSocio, type SocioBreakdown } from "@/lib/socio";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { andScope, resolveDataScope } from "@/lib/data-scope";

export type TerritorioKpis = {
  inscritos: number;
  selecionados: number;
  participantes: number;
  certificados: number;
  oficinas: number;
  projetos: number;
};

export type MapPoint = {
  cidade: string;
  estado: string;
  href: string;
  lat: number;
  lng: number;
  inscritos: number;
  selecionados: number;
  participantes: number;
  certificados: number;
};

export type CidadeListItem = {
  cidade: string;
  href: string;
  kpis: TerritorioKpis;
  territorios: number;
};

export type TerritorioListItem = {
  territorio: string;
  href: string;
  kpis: TerritorioKpis;
};

export type OficinaListItem = {
  id_projeto: string;
  id_oficina: string;
  Nome_projeto: string;
  Nome_oficina: string;
  href: string;
  kpis: TerritorioKpis;
};

function emptyKpis(): TerritorioKpis {
  return {
    inscritos: 0,
    selecionados: 0,
    participantes: 0,
    certificados: 0,
    oficinas: 0,
    projetos: 0,
  };
}

function accumulate(
  acc: TerritorioKpis,
  row: {
    inscritos: number;
    selecionados: number;
    participantes: number;
    certificado: number;
    idOficina: string;
    idProjeto: string;
  },
  seenOficina: Set<string>,
  seenProjeto: Set<string>,
) {
  acc.inscritos += row.inscritos;
  acc.selecionados += row.selecionados;
  acc.participantes += row.participantes;
  acc.certificados += row.certificado;
  if (row.idOficina && !seenOficina.has(row.idOficina)) {
    seenOficina.add(row.idOficina);
    acc.oficinas += 1;
  }
  if (row.idProjeto && !seenProjeto.has(row.idProjeto)) {
    seenProjeto.add(row.idProjeto);
    acc.projetos += 1;
  }
}

async function territorioQuery(extraWhere: Prisma.InscricaoWhereInput = {}) {
  const user = await requirePermission("consultas:territorio");
  const scope = await resolveDataScope(user.id);
  const where = andScope(scope, extraWhere);
  return { user, scope, where };
}

async function loadAggRows(where: Prisma.InscricaoWhereInput) {
  return prisma.inscricao.findMany({
    where,
    select: {
      id: true,
      estado: true,
      cidade: true,
      territorio: true,
      idProjeto: true,
      idOficina: true,
      nomeProjeto: true,
      nomeOficina: true,
      inscritos: true,
      selecionados: true,
      participantes: true,
      certificado: true,
    },
  });
}

async function loadDetailRows(where: Prisma.InscricaoWhereInput) {
  return prisma.inscricao.findMany({
    where,
    select: {
      id: true,
      estado: true,
      cidade: true,
      territorio: true,
      idProjeto: true,
      idOficina: true,
      nomeProjeto: true,
      nomeOficina: true,
      inscritos: true,
      selecionados: true,
      participantes: true,
      certificado: true,
      cpf: true,
      nome: true,
      email: true,
      telefone: true,
    },
  });
}

async function attachMapPoints(
  cities: Array<{
    cidade: string;
    estado: string;
    kpis: TerritorioKpis;
  }>,
): Promise<MapPoint[]> {
  if (cities.length === 0) return [];

  const resolved = cities.map((c) => {
    const city = normalizeAddressLine(c.cidade);
    const geoUf = resolveGeoUf(c.cidade, c.estado);
    return {
      ...c,
      city,
      geoUf,
      local: lookupMunicipioCoords(city, geoUf),
    };
  });

  const needCache = resolved.filter((c) => !c.local);
  const cached =
    needCache.length === 0
      ? []
      : await prisma.geoCache.findMany({
          where: {
            key: {
              in: needCache.map((c) => geoCacheKey(c.city, c.geoUf)),
            },
          },
        });
  const byKey = new Map(cached.map((c) => [c.key, c]));

  // Nominatim só para o que não está no IBGE nem no cache (máx. 3 / request).
  const missing = needCache.filter(
    (c) => !byKey.has(geoCacheKey(c.city, c.geoUf)),
  );
  if (missing.length > 0) {
    void (async () => {
      for (const m of missing.slice(0, 3)) {
        try {
          await ensureCityCoords(m.cidade, m.estado);
          await new Promise((r) => setTimeout(r, 1100));
        } catch {
          /* ignore */
        }
      }
    })();
  }

  const points: MapPoint[] = [];
  const seen = new Map<string, MapPoint>();
  for (const c of resolved) {
    const hit = byKey.get(geoCacheKey(c.city, c.geoUf));
    const lat = c.local?.lat ?? hit?.lat;
    const lng = c.local?.lng ?? hit?.lng;
    if (lat == null || lng == null) continue;
    const dedupeKey = `${c.geoUf}|${c.city}`;
    const existing = seen.get(dedupeKey);
    if (existing) {
      existing.inscritos += c.kpis.inscritos;
      existing.selecionados += c.kpis.selecionados;
      existing.participantes += c.kpis.participantes;
      existing.certificados += c.kpis.certificados;
      continue;
    }
    const point: MapPoint = {
      cidade: c.city,
      estado: c.geoUf,
      href: buildTerritorioPath({ estado: c.geoUf, cidade: c.city }),
      lat,
      lng,
      inscritos: c.kpis.inscritos,
      selecionados: c.kpis.selecionados,
      participantes: c.kpis.participantes,
      certificados: c.kpis.certificados,
    };
    seen.set(dedupeKey, point);
    points.push(point);
  }
  return points;
}

export async function listTerritoriosOverviewAction(): Promise<{
  estados: Array<{ estado: string; href: string; kpis: TerritorioKpis }>;
  mapPoints: MapPoint[];
  totais: TerritorioKpis;
  online: { href: string; kpis: TerritorioKpis; labels: number } | null;
  socio: SocioBreakdown;
}> {
  const { where } = await territorioQuery({});
  const [rows, socio] = await Promise.all([
    loadAggRows(where),
    aggregateSocio(where),
  ]);

  const byEstado = new Map<
    string,
    { kpis: TerritorioKpis; oficinas: Set<string>; projetos: Set<string> }
  >();
  const byCidade = new Map<
    string,
    {
      cidade: string;
      estado: string;
      kpis: TerritorioKpis;
      oficinas: Set<string>;
      projetos: Set<string>;
    }
  >();
  const totais = emptyKpis();
  const totOf = new Set<string>();
  const totPr = new Set<string>();
  const onlineKpis = emptyKpis();
  const onlineOf = new Set<string>();
  const onlinePr = new Set<string>();
  const onlineLabels = new Set<string>();

  for (const row of rows) {
    const uf = normalizeUf(row.estado);
    const cidade = normalizeAddressLine(row.cidade);
    const online = isOnlineRow({
      territorio: row.territorio,
      cidade: row.cidade,
      nomeOficina: row.nomeOficina,
    });

    accumulate(totais, row, totOf, totPr);

    if (online) {
      accumulate(onlineKpis, row, onlineOf, onlinePr);
      onlineLabels.add(
        onlineLabel({
          territorio: row.territorio,
          nomeOficina: row.nomeOficina,
        }),
      );
      continue;
    }

    if (uf) {
      const entry = byEstado.get(uf) ?? {
        kpis: emptyKpis(),
        oficinas: new Set<string>(),
        projetos: new Set<string>(),
      };
      accumulate(entry.kpis, row, entry.oficinas, entry.projetos);
      byEstado.set(uf, entry);
    }

    if (uf && cidade) {
      const key = `${uf}|${cidade}`;
      const entry = byCidade.get(key) ?? {
        cidade,
        estado: uf,
        kpis: emptyKpis(),
        oficinas: new Set<string>(),
        projetos: new Set<string>(),
      };
      accumulate(entry.kpis, row, entry.oficinas, entry.projetos);
      byCidade.set(key, entry);
    }
  }

  const estados = [...byEstado.entries()]
    .map(([estado, v]) => ({
      estado,
      href: buildTerritorioPath({ estado }),
      kpis: v.kpis,
    }))
    .sort((a, b) => a.estado.localeCompare(b.estado, "pt-BR"));

  const cityList = [...byCidade.values()].map((v) => ({
    cidade: v.cidade,
    estado: v.estado,
    kpis: v.kpis,
  }));

  const mapPoints = await attachMapPoints(cityList);

  const online =
    onlineKpis.inscritos > 0
      ? {
          href: "/territorio/online",
          kpis: onlineKpis,
          labels: onlineLabels.size,
        }
      : null;

  return { estados, mapPoints, totais, online, socio };
}

export async function getEstadoPageAction(ufRaw: string): Promise<
  | {
      ok: true;
      data: {
        estado: string;
        href: string;
        kpis: TerritorioKpis;
        cidades: CidadeListItem[];
        mapPoints: MapPoint[];
        socio: SocioBreakdown;
      };
    }
  | { ok: false; error: string }
> {
  const estado = normalizeUf(ufRaw);
  if (!estado || estado.length !== 2) {
    return { ok: false, error: "UF inválida." };
  }

  const estadoWhere: Prisma.InscricaoWhereInput = {
    estado: { equals: estado, mode: "insensitive" },
  };
  const { where } = await territorioQuery(estadoWhere);
  const [rows, socio] = await Promise.all([
    loadAggRows(where),
    aggregateSocio(where),
  ]);
  // Also match exact UF after normalize — DB may store "MA"
  const filtered = rows.filter(
    (r) =>
      normalizeUf(r.estado) === estado &&
      !isOnlineRow({
        territorio: r.territorio,
        cidade: r.cidade,
        nomeOficina: r.nomeOficina,
      }),
  );
  if (filtered.length === 0) {
    return { ok: false, error: `Nenhuma inscrição no estado ${estado}.` };
  }

  const kpis = emptyKpis();
  const ofSet = new Set<string>();
  const prSet = new Set<string>();
  const byCidade = new Map<
    string,
    {
      cidade: string;
      kpis: TerritorioKpis;
      oficinas: Set<string>;
      projetos: Set<string>;
      terrs: Set<string>;
    }
  >();

  for (const row of filtered) {
    accumulate(kpis, row, ofSet, prSet);
    const cidade = normalizeAddressLine(row.cidade) || "(sem cidade)";
    const entry = byCidade.get(cidade) ?? {
      cidade,
      kpis: emptyKpis(),
      oficinas: new Set<string>(),
      projetos: new Set<string>(),
      terrs: new Set<string>(),
    };
    accumulate(entry.kpis, row, entry.oficinas, entry.projetos);
    const terr = normalizeAddressLine(row.territorio);
    // Comunidade sob cidade: nunca município IBGE nem modalidade online
    if (
      terr &&
      !isOnlineTerritorio(terr) &&
      !isKnownMunicipio(terr) &&
      !matchesSlug(terr, cidade)
    ) {
      entry.terrs.add(terr);
    }
    byCidade.set(cidade, entry);
  }

  const cidades: CidadeListItem[] = [...byCidade.values()]
    .filter((c) => c.cidade !== "(sem cidade)")
    .map((c) => ({
      cidade: c.cidade,
      href: buildTerritorioPath({ estado, cidade: c.cidade }),
      kpis: c.kpis,
      territorios: c.terrs.size,
    }))
    .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"));

  const mapPoints = await attachMapPoints(
    cidades.map((c) => ({ cidade: c.cidade, estado, kpis: c.kpis })),
  );

  return {
    ok: true,
    data: {
      estado,
      href: buildTerritorioPath({ estado }),
      kpis,
      cidades,
      mapPoints,
      socio,
    },
  };
}

export async function getCidadePageAction(
  ufRaw: string,
  cidadeSlug: string,
): Promise<
  | {
      ok: true;
      data: {
        estado: string;
        cidade: string;
        href: string;
        kpis: TerritorioKpis;
        territorios: TerritorioListItem[];
        oficinas: OficinaListItem[];
        mapPoints: MapPoint[];
        socio: SocioBreakdown;
      };
    }
  | { ok: false; error: string }
> {
  const estado = normalizeUf(ufRaw);
  if (!estado || estado.length !== 2) {
    return { ok: false, error: "UF inválida." };
  }

  const { where } = await territorioQuery({
    estado: { equals: estado, mode: "insensitive" },
  });
  const rowsAll = await loadAggRows(where);
  const inEstado = rowsAll.filter((r) => normalizeUf(r.estado) === estado);
  const cidadeCanon =
    inEstado.find((r) => matchesSlug(r.cidade, cidadeSlug))?.cidade ??
    null;

  if (!cidadeCanon) {
    return { ok: false, error: "Cidade não encontrada neste estado." };
  }

  const cidade = normalizeAddressLine(cidadeCanon);
  const rows = inEstado.filter(
    (r) =>
      normalizeAddressLine(r.cidade) === cidade &&
      !isOnlineRow({
        territorio: r.territorio,
        cidade: r.cidade,
        nomeOficina: r.nomeOficina,
      }),
  );

  if (rows.length === 0) {
    return { ok: false, error: "Cidade não encontrada neste estado." };
  }

  const kpis = emptyKpis();
  const ofSet = new Set<string>();
  const prSet = new Set<string>();
  const byTerr = new Map<
    string,
    {
      territorio: string;
      kpis: TerritorioKpis;
      oficinas: Set<string>;
      projetos: Set<string>;
    }
  >();
  const byOficina = new Map<
    string,
    {
      id_projeto: string;
      id_oficina: string;
      Nome_projeto: string;
      Nome_oficina: string;
      kpis: TerritorioKpis;
      oficinas: Set<string>;
      projetos: Set<string>;
    }
  >();

  for (const row of rows) {
    accumulate(kpis, row, ofSet, prSet);
    const terr = normalizeAddressLine(row.territorio);
    // Comunidade sob cidade: nunca município IBGE nem modalidade online
    if (
      terr &&
      !isOnlineTerritorio(terr) &&
      !isKnownMunicipio(terr) &&
      !matchesSlug(terr, cidade)
    ) {
      const entry = byTerr.get(terr) ?? {
        territorio: terr,
        kpis: emptyKpis(),
        oficinas: new Set<string>(),
        projetos: new Set<string>(),
      };
      accumulate(entry.kpis, row, entry.oficinas, entry.projetos);
      byTerr.set(terr, entry);
    }
    const ok = `${row.idProjeto}|${row.idOficina}`;
    const of = byOficina.get(ok) ?? {
      id_projeto: row.idProjeto,
      id_oficina: row.idOficina,
      Nome_projeto: row.nomeProjeto,
      Nome_oficina: row.nomeOficina || row.idOficina,
      kpis: emptyKpis(),
      oficinas: new Set<string>(),
      projetos: new Set<string>(),
    };
    accumulate(of.kpis, row, of.oficinas, of.projetos);
    byOficina.set(ok, of);
  }

  const territorios: TerritorioListItem[] = [...byTerr.values()]
    .map((t) => ({
      territorio: t.territorio,
      href: buildTerritorioPath({
        estado,
        cidade,
        territorio: t.territorio,
      }),
      kpis: t.kpis,
    }))
    .sort((a, b) => a.territorio.localeCompare(b.territorio, "pt-BR"));

  const oficinas: OficinaListItem[] = [...byOficina.values()]
    .map((o) => ({
      id_projeto: o.id_projeto,
      id_oficina: o.id_oficina,
      Nome_projeto: o.Nome_projeto,
      Nome_oficina: o.Nome_oficina,
      href: `/projeto/${encodeURIComponent(o.id_projeto)}/${encodeURIComponent(o.id_oficina)}`,
      kpis: o.kpis,
    }))
    .sort((a, b) => a.Nome_oficina.localeCompare(b.Nome_oficina, "pt-BR"));

  const mapPoints = await attachMapPoints([{ cidade, estado, kpis }]);
  const { where: cidadeWhere } = await territorioQuery({
    estado: { equals: estado, mode: "insensitive" },
    cidade: { equals: cidade, mode: "insensitive" },
  });
  const socio = await aggregateSocio(cidadeWhere);

  return {
    ok: true,
    data: {
      estado,
      cidade,
      href: buildTerritorioPath({ estado, cidade }),
      kpis,
      territorios,
      oficinas,
      mapPoints,
      socio,
    },
  };
}

export async function getTerritorioPageAction(
  ufRaw: string,
  cidadeSlug: string,
  territorioSlug: string,
): Promise<
  | {
      ok: true;
      data: {
        estado: string;
        cidade: string;
        territorio: string;
        href: string;
        kpis: TerritorioKpis;
        oficinas: OficinaListItem[];
        inscritos: Array<{
          id: string;
          Nome: string;
          CPF: string;
          cpfDisplay: string;
          "E-mail": string;
          Telefone: string;
          telefoneDisplay: string;
          Selecionados: number;
          Participantes: number;
          Certificado: number;
        }>;
        mapPoints: MapPoint[];
        socio: SocioBreakdown;
      };
    }
  | { ok: false; error: string; redirectHref?: string }
> {
  const cidadeResult = await getCidadePageAction(ufRaw, cidadeSlug);
  if (!cidadeResult.ok) return cidadeResult;

  const { estado, cidade } = cidadeResult.data;

  // Se o segmento "territorio" é na verdade um município, redireciona
  const { where: estadoWhere } = await territorioQuery({
    estado: { equals: estado, mode: "insensitive" },
  });
  const cityHits = await loadAggRows(estadoWhere);
  const asOwnCity = cityHits.find(
    (r) =>
      matchesSlug(r.cidade, territorioSlug) && isKnownMunicipio(r.cidade),
  );
  if (asOwnCity) {
    return {
      ok: false,
      error: "Este nome é um município, não uma comunidade.",
      redirectHref: buildTerritorioPath({
        estado: normalizeUf(asOwnCity.estado) || estado,
        cidade: normalizeAddressLine(asOwnCity.cidade),
      }),
    };
  }

  const rowsAll = cityHits;
  const rows = rowsAll.filter(
    (r) =>
      normalizeUf(r.estado) === estado &&
      normalizeAddressLine(r.cidade) === cidade &&
      matchesSlug(r.territorio, territorioSlug) &&
      !isKnownMunicipio(r.territorio) &&
      !isOnlineRow({
        territorio: r.territorio,
        cidade: r.cidade,
        nomeOficina: r.nomeOficina,
      }),
  );

  if (rows.length === 0) {
    // Território preenchido com nome de município sob outra cidade (legado)
    const legacy = rowsAll.filter(
      (r) =>
        normalizeUf(r.estado) === estado &&
        normalizeAddressLine(r.cidade) === cidade &&
        matchesSlug(r.territorio, territorioSlug) &&
        isKnownMunicipio(r.territorio),
    );
    if (legacy.length > 0) {
      const mun = normalizeAddressLine(legacy[0]!.territorio);
      return {
        ok: false,
        error: "Este nome é um município, não uma comunidade.",
        redirectHref: buildTerritorioPath({
          estado: lookupUfByCidade(mun) || estado,
          cidade: mun,
        }),
      };
    }
    return { ok: false, error: "Território (comunidade) não encontrado." };
  }

  const territorio = normalizeAddressLine(rows[0]!.territorio);
  const { where: terrWhere } = await territorioQuery({
    estado: { equals: estado, mode: "insensitive" },
    cidade: { equals: cidade, mode: "insensitive" },
    territorio: { equals: territorio, mode: "insensitive" },
  });
  const fullRows = await loadDetailRows(terrWhere);

  const kpis = emptyKpis();
  const ofSet = new Set<string>();
  const prSet = new Set<string>();
  const byOficina = new Map<
    string,
    {
      id_projeto: string;
      id_oficina: string;
      Nome_projeto: string;
      Nome_oficina: string;
      kpis: TerritorioKpis;
      oficinas: Set<string>;
      projetos: Set<string>;
    }
  >();

  for (const row of fullRows) {
    accumulate(kpis, row, ofSet, prSet);
    const ok = `${row.idProjeto}|${row.idOficina}`;
    const of = byOficina.get(ok) ?? {
      id_projeto: row.idProjeto,
      id_oficina: row.idOficina,
      Nome_projeto: row.nomeProjeto,
      Nome_oficina: row.nomeOficina || row.idOficina,
      kpis: emptyKpis(),
      oficinas: new Set<string>(),
      projetos: new Set<string>(),
    };
    accumulate(of.kpis, row, of.oficinas, of.projetos);
    byOficina.set(ok, of);
  }

  const oficinas: OficinaListItem[] = [...byOficina.values()].map((o) => ({
    id_projeto: o.id_projeto,
    id_oficina: o.id_oficina,
    Nome_projeto: o.Nome_projeto,
    Nome_oficina: o.Nome_oficina,
    href: `/projeto/${encodeURIComponent(o.id_projeto)}/${encodeURIComponent(o.id_oficina)}`,
    kpis: o.kpis,
  }));

  const inscritos = fullRows.map((row) => ({
    id: row.id,
    Nome: row.nome,
    CPF: row.cpf,
    cpfDisplay: formatCellDisplay("CPF", row.cpf),
    "E-mail": row.email,
    Telefone: row.telefone,
    telefoneDisplay: formatCellDisplay("Telefone", row.telefone),
    Selecionados: row.selecionados,
    Participantes: row.participantes,
    Certificado: row.certificado,
  }));

  const mapPoints = await attachMapPoints([{ cidade, estado, kpis }]);
  const socio = await aggregateSocio(terrWhere);

  return {
    ok: true,
    data: {
      estado,
      cidade,
      territorio,
      href: buildTerritorioPath({ estado, cidade, territorio }),
      kpis,
      oficinas,
      inscritos,
      mapPoints,
      socio,
    },
  };
}

export async function resolveCityCoordsAction(
  cidade: string,
  estado: string,
): Promise<CityCoords | null> {
  return ensureCityCoords(cidade, estado);
}

export async function listOnlineTerritoriosAction(): Promise<{
  kpis: TerritorioKpis;
  items: Array<{ label: string; href: string; kpis: TerritorioKpis }>;
  socio: SocioBreakdown;
}> {
  const { where } = await territorioQuery({});
  const rows = await loadAggRows(where);
  const onlineRows = rows.filter((r) =>
    isOnlineRow({
      territorio: r.territorio,
      cidade: r.cidade,
      nomeOficina: r.nomeOficina,
    }),
  );

  const onlineIds = onlineRows.map((r) => r.id);
  const socio =
    onlineIds.length > 0
      ? await aggregateSocio({ id: { in: onlineIds } })
      : await aggregateSocio({ id: { in: ["__none__"] } });

  const kpis = emptyKpis();
  const ofSet = new Set<string>();
  const prSet = new Set<string>();
  const byLabel = new Map<
    string,
    {
      label: string;
      kpis: TerritorioKpis;
      oficinas: Set<string>;
      projetos: Set<string>;
    }
  >();

  for (const row of onlineRows) {
    accumulate(kpis, row, ofSet, prSet);
    const label = onlineLabel({
      territorio: row.territorio,
      nomeOficina: row.nomeOficina,
    });
    const entry = byLabel.get(label) ?? {
      label,
      kpis: emptyKpis(),
      oficinas: new Set<string>(),
      projetos: new Set<string>(),
    };
    accumulate(entry.kpis, row, entry.oficinas, entry.projetos);
    byLabel.set(label, entry);
  }

  const items = [...byLabel.values()]
    .map((v) => ({
      label: v.label,
      href: buildTerritorioPath({
        online: true,
        territorio: v.label,
      }),
      kpis: v.kpis,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  return { kpis, items, socio };
}

export async function getOnlineTerritorioPageAction(slugRaw: string): Promise<
  | {
      ok: true;
      data: {
        label: string;
        href: string;
        kpis: TerritorioKpis;
        oficinas: OficinaListItem[];
        inscritos: Array<{
          id: string;
          Nome: string;
          CPF: string;
          cpfDisplay: string;
          "E-mail": string;
          Telefone: string;
          telefoneDisplay: string;
          Selecionados: number;
          Participantes: number;
          Certificado: number;
        }>;
        socio: SocioBreakdown;
      };
    }
  | { ok: false; error: string }
> {
  const slug = slugifyPart(slugRaw);
  if (!slug) return { ok: false, error: "Slug inválido." };

  const { where } = await territorioQuery({});
  const agg = await loadAggRows(where);
  const matchIds = agg
    .filter((r) => {
      if (
        !isOnlineRow({
          territorio: r.territorio,
          cidade: r.cidade,
          nomeOficina: r.nomeOficina,
        })
      ) {
        return false;
      }
      const label = onlineLabel({
        territorio: r.territorio,
        nomeOficina: r.nomeOficina,
      });
      return matchesSlug(label, slug);
    })
    .map((r) => r.id);

  if (matchIds.length === 0) {
    return { ok: false, error: "Oficina online não encontrada." };
  }

  const fullRows = await loadDetailRows({ id: { in: matchIds } });

  const label = onlineLabel({
    territorio: fullRows[0]!.territorio,
    nomeOficina: fullRows[0]!.nomeOficina,
  });
  const kpis = emptyKpis();
  const ofSet = new Set<string>();
  const prSet = new Set<string>();
  const byOficina = new Map<
    string,
    {
      id_projeto: string;
      id_oficina: string;
      Nome_projeto: string;
      Nome_oficina: string;
      kpis: TerritorioKpis;
      oficinas: Set<string>;
      projetos: Set<string>;
    }
  >();

  for (const row of fullRows) {
    accumulate(kpis, row, ofSet, prSet);
    const ok = `${row.idProjeto}|${row.idOficina}`;
    const of = byOficina.get(ok) ?? {
      id_projeto: row.idProjeto,
      id_oficina: row.idOficina,
      Nome_projeto: row.nomeProjeto,
      Nome_oficina: row.nomeOficina || row.idOficina,
      kpis: emptyKpis(),
      oficinas: new Set<string>(),
      projetos: new Set<string>(),
    };
    accumulate(of.kpis, row, of.oficinas, of.projetos);
    byOficina.set(ok, of);
  }

  const socio = await aggregateSocio({
    id: { in: fullRows.map((r) => r.id) },
  });

  return {
    ok: true,
    data: {
      label,
      href: buildTerritorioPath({ online: true, territorio: label }),
      kpis,
      oficinas: [...byOficina.values()].map((o) => ({
        id_projeto: o.id_projeto,
        id_oficina: o.id_oficina,
        Nome_projeto: o.Nome_projeto,
        Nome_oficina: o.Nome_oficina,
        href: `/projeto/${encodeURIComponent(o.id_projeto)}/${encodeURIComponent(o.id_oficina)}`,
        kpis: o.kpis,
      })),
      inscritos: fullRows.map((row) => ({
        id: row.id,
        Nome: row.nome,
        CPF: row.cpf,
        cpfDisplay: formatCellDisplay("CPF", row.cpf),
        "E-mail": row.email,
        Telefone: row.telefone,
        telefoneDisplay: formatCellDisplay("Telefone", row.telefone),
        Selecionados: row.selecionados,
        Participantes: row.participantes,
        Certificado: row.certificado,
      })),
      socio,
    },
  };
}

