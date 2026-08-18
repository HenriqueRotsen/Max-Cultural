"use server";

import { prisma } from "@/lib/prisma";
import { prismaToRow } from "@/lib/schema";
import { formatCpfDisplay, normalizeAddressLine, normalizeUf } from "@/lib/normalize";
import { formatCellDisplay } from "@/lib/validate";
import { aggregateSocio, type SocioBreakdown } from "@/lib/socio";
import { getContextoForProjeto } from "@/app/actions/programa";
import {
  isOnlineRow,
  onlineLabel,
} from "@/lib/territorio-online";
import { buildTerritorioPath } from "@/lib/territorio-slug";
import { requireAuth } from "@/lib/auth";
import { andScope, assertDataAccess, resolveDataScope } from "@/lib/data-scope";
import { getEffectivePermissions } from "@/lib/permissions";

export type OficinaResumo = {
  id_oficina: string;
  Nome_oficina: string;
  inscritos: number;
  selecionados: number;
  participantes: number;
  certificados: number;
};

export type ProjetoOficinaInscrito = {
  id: string;
  Nome: string;
  CPF: string;
  cpfDisplay: string;
  "E-mail": string;
  Telefone: string;
  telefoneDisplay: string;
  Cidade: string;
  Estado: string;
  Territorio: string;
  Data_inscricao: string;
  Selecionados: number;
  Participantes: number;
  Certificado: number;
};

export type OficinaLocalizacao = {
  kind: "online" | "presencial";
  label: string;
  href: string;
  inscritos: number;
  estado?: string;
  cidade?: string;
  territorio?: string;
};

export type ProjetoPageData = {
  id_projeto: string;
  Nome_projeto: string;
  PROPONENTE: string;
  PRONAC: string;
  Identificacao_ano_projeto: string;
  oficinas: OficinaResumo[];
  totais: {
    inscritos: number;
    selecionados: number;
    participantes: number;
    certificados: number;
    oficinas: number;
  };
  socio: SocioBreakdown;
  programa: { id: string; label: string; siblings: number } | null;
};

export type OficinaPageData = {
  id_projeto: string;
  Nome_projeto: string;
  id_oficina: string;
  Nome_oficina: string;
  PROPONENTE: string;
  PRONAC: string;
  Identificacao_ano_projeto: string;
  localizacoes: OficinaLocalizacao[];
  totais: {
    inscritos: number;
    selecionados: number;
    participantes: number;
    certificados: number;
    taxaSelecao: number;
    taxaParticipacao: number;
    taxaCertificado: number;
  };
  inscritos: ProjetoOficinaInscrito[];
  socio: SocioBreakdown;
};

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function presencialLabel(parts: {
  estado: string;
  cidade: string;
  territorio: string;
}): string {
  const bits: string[] = [];
  if (parts.territorio) bits.push(parts.territorio);
  const cityUf = [parts.cidade, parts.estado].filter(Boolean).join("/");
  if (cityUf) bits.push(cityUf);
  return bits.join(" · ") || "Local não informado";
}

function collectLocalizacoes(
  records: Array<{
    estado: string;
    cidade: string;
    territorio: string;
    nomeOficina: string;
  }>,
): OficinaLocalizacao[] {
  const map = new Map<string, OficinaLocalizacao>();

  for (const r of records) {
    const online = isOnlineRow({
      territorio: r.territorio,
      cidade: r.cidade,
      nomeOficina: r.nomeOficina,
    });

    if (online) {
      const label = onlineLabel({
        territorio: r.territorio,
        nomeOficina: r.nomeOficina,
      });
      const key = `online|${label.toLowerCase()}`;
      const cur = map.get(key);
      if (cur) {
        cur.inscritos += 1;
      } else {
        map.set(key, {
          kind: "online",
          label,
          href: buildTerritorioPath({
            online: true,
            territorio: label,
            nomeOficina: r.nomeOficina,
          }),
          inscritos: 1,
          territorio: label,
        });
      }
      continue;
    }

    const estado = normalizeUf(r.estado);
    const cidade = normalizeAddressLine(r.cidade);
    const territorio = normalizeAddressLine(r.territorio);
    if (!estado && !cidade && !territorio) continue;

    const key = `presencial|${estado}|${cidade}|${territorio}`.toLowerCase();
    const cur = map.get(key);
    if (cur) {
      cur.inscritos += 1;
    } else {
      map.set(key, {
        kind: "presencial",
        label: presencialLabel({ estado, cidade, territorio }),
        href: buildTerritorioPath({ estado, cidade, territorio }),
        inscritos: 1,
        estado: estado || undefined,
        cidade: cidade || undefined,
        territorio: territorio || undefined,
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "presencial" ? -1 : 1;
    return b.inscritos - a.inscritos || a.label.localeCompare(b.label, "pt-BR");
  });
}

export async function getProjetoPageAction(
  idProjetoRaw: string,
): Promise<{ ok: true; data: ProjetoPageData } | { ok: false; error: string }> {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (
    !perms.has("consultas:territorio") &&
    !perms.has("inscricoes:read") &&
    !perms.has("analise:read")
  ) {
    return { ok: false, error: "Sem permissão para consultar este projeto." };
  }

  const idProjeto = decodeURIComponent(idProjetoRaw).trim();
  if (!idProjeto) return { ok: false, error: "Projeto inválido." };

  const allowed = await assertDataAccess(user.id, { idProjeto });
  if (!allowed) {
    return { ok: false, error: "Fora do seu acesso a este projeto." };
  }

  const scope = await resolveDataScope(user.id);
  const records = await prisma.inscricao.findMany({
    where: andScope(scope, { idProjeto }),
    orderBy: [{ idOficina: "asc" }, { nome: "asc" }],
  });

  if (records.length === 0) {
    return { ok: false, error: "Nenhum registro encontrado para este projeto." };
  }

  const first = records[0]!;
  const byOficina = new Map<string, OficinaResumo>();

  for (const r of records) {
    const key = r.idOficina;
    const cur = byOficina.get(key) ?? {
      id_oficina: r.idOficina,
      Nome_oficina: r.nomeOficina || r.idOficina,
      inscritos: 0,
      selecionados: 0,
      participantes: 0,
      certificados: 0,
    };
    cur.inscritos += r.inscritos || 1;
    cur.selecionados += r.selecionados || 0;
    cur.participantes += r.participantes || 0;
    cur.certificados += r.certificado || 0;
    if (!cur.Nome_oficina && r.nomeOficina) cur.Nome_oficina = r.nomeOficina;
    byOficina.set(key, cur);
  }

  const oficinas = [...byOficina.values()].sort((a, b) =>
    a.Nome_oficina.localeCompare(b.Nome_oficina, "pt-BR"),
  );

  const totais = oficinas.reduce(
    (acc, o) => {
      acc.inscritos += o.inscritos;
      acc.selecionados += o.selecionados;
      acc.participantes += o.participantes;
      acc.certificados += o.certificados;
      return acc;
    },
    { inscritos: 0, selecionados: 0, participantes: 0, certificados: 0, oficinas: 0 },
  );
  totais.oficinas = oficinas.length;

  const [socio, programa] = await Promise.all([
    aggregateSocio(andScope(scope, { idProjeto })),
    getContextoForProjeto(idProjeto),
  ]);

  return {
    ok: true,
    data: {
      id_projeto: idProjeto,
      Nome_projeto: first.nomeProjeto || idProjeto,
      PROPONENTE: first.proponente,
      PRONAC: first.pronac,
      Identificacao_ano_projeto: first.identificacaoAnoProjeto,
      oficinas,
      totais,
      socio,
      programa,
    },
  };
}

export async function getOficinaPageAction(
  idProjetoRaw: string,
  idOficinaRaw: string,
): Promise<{ ok: true; data: OficinaPageData } | { ok: false; error: string }> {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (
    !perms.has("consultas:territorio") &&
    !perms.has("inscricoes:read") &&
    !perms.has("analise:read")
  ) {
    return { ok: false, error: "Sem permissão para consultar esta oficina." };
  }

  const idProjeto = decodeURIComponent(idProjetoRaw).trim();
  const idOficina = decodeURIComponent(idOficinaRaw).trim();
  if (!idProjeto || !idOficina) {
    return { ok: false, error: "Projeto ou oficina inválidos." };
  }

  const allowed = await assertDataAccess(user.id, {
    idProjeto,
    idOficina,
  });
  if (!allowed) {
    return { ok: false, error: "Fora do seu acesso a esta oficina." };
  }

  const scope = await resolveDataScope(user.id);
  const records = await prisma.inscricao.findMany({
    where: andScope(scope, { idProjeto, idOficina }),
    orderBy: [{ nome: "asc" }],
  });

  if (records.length === 0) {
    return {
      ok: false,
      error: "Nenhum registro encontrado para esta oficina neste projeto.",
    };
  }

  const first = records[0]!;
  const rows = records.map(prismaToRow);

  let selecionados = 0;
  let participantes = 0;
  let certificados = 0;
  const inscritosList: ProjetoOficinaInscrito[] = rows.map((row, i) => {
    if (row.Selecionados === 1) selecionados += 1;
    if (row.Participantes === 1) participantes += 1;
    if (row.Certificado === 1) certificados += 1;
    return {
      id: records[i]!.id,
      Nome: row.Nome,
      CPF: row.CPF,
      cpfDisplay: formatCpfDisplay(row.CPF) || row.CPF,
      "E-mail": row["E-mail"],
      Telefone: row.Telefone,
      telefoneDisplay: formatCellDisplay("Telefone", row.Telefone),
      Cidade: row.Cidade,
      Estado: row.Estado,
      Territorio: row.Territorio,
      Data_inscricao: row.Data_inscricao,
      Selecionados: row.Selecionados,
      Participantes: row.Participantes,
      Certificado: row.Certificado,
    };
  });

  const inscritos = inscritosList.length;
  const localizacoes = collectLocalizacoes(records);
  const socio = await aggregateSocio(andScope(scope, { idProjeto, idOficina }));

  return {
    ok: true,
    data: {
      id_projeto: idProjeto,
      Nome_projeto: first.nomeProjeto || idProjeto,
      id_oficina: idOficina,
      Nome_oficina: first.nomeOficina || idOficina,
      PROPONENTE: first.proponente,
      PRONAC: first.pronac,
      Identificacao_ano_projeto: first.identificacaoAnoProjeto,
      localizacoes,
      totais: {
        inscritos,
        selecionados,
        participantes,
        certificados,
        taxaSelecao: pct(selecionados, inscritos),
        taxaParticipacao: pct(participantes, selecionados || inscritos),
        taxaCertificado: pct(certificados, participantes || selecionados || inscritos),
      },
      inscritos: inscritosList,
      socio,
    },
  };
}
