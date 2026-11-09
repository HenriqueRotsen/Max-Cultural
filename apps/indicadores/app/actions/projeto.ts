"use server";

import { prisma } from "@/lib/prisma";
import { prismaToRow } from "@/lib/schema";
import { formatCpfDisplay, normalizeAddressLine, normalizeUf } from "@/lib/normalize";
import { formatCellDisplay } from "@/lib/validate";
import {
  aggregateSocio,
  andSocioCohort,
  type SocioBreakdown,
  type SocioCohort,
} from "@/lib/socio";
import { getContextoForProjeto } from "@/app/actions/programa";
import {
  isOnlineRow,
  onlineLabel,
} from "@/lib/territorio-online";
import { buildTerritorioPath } from "@/lib/territorio-slug";
import { requireAuth } from "@/lib/auth";
import { andScope, assertDataAccess, resolveDataScope } from "@/lib/data-scope";
import { getEffectivePermissions } from "@/lib/permissions";
import { contarCpfsUnicos, cpfsPorGrupo } from "@/lib/cpfs-unicos";

export type AcaoResumo = {
  id_oficina: string;
  Nome_oficina: string;
  inscritos: number;
  selecionados: number;
  participantes: number;
  certificados: number;
  /** Pessoas diferentes (CPFs únicos) inscritas na ação. */
  cpfsUnicos: number;
};

export type ProjetoAcaoInscrito = {
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

export type AcaoLocalizacao = {
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
  acoes: AcaoResumo[];
  totais: {
    inscritos: number;
    selecionados: number;
    participantes: number;
    certificados: number;
    cpfsUnicos: number;
    acoes: number;
  };
  socio: SocioBreakdown;
  programa: { id: string; label: string; siblings: number } | null;
  contextoId: string;
  contextoNome: string;
  canEditContexto: boolean;
};

export type AcaoPageData = {
  id_projeto: string;
  Nome_projeto: string;
  id_oficina: string;
  Nome_oficina: string;
  PROPONENTE: string;
  PRONAC: string;
  Identificacao_ano_projeto: string;
  localizacoes: AcaoLocalizacao[];
  totais: {
    inscritos: number;
    selecionados: number;
    participantes: number;
    certificados: number;
    cpfsUnicos: number;
    taxaSelecao: number;
    taxaParticipacao: number;
    taxaCertificado: number;
  };
  inscritos: ProjetoAcaoInscrito[];
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
    nomeAcao: string;
  }>,
): AcaoLocalizacao[] {
  const map = new Map<string, AcaoLocalizacao>();

  for (const r of records) {
    const online = isOnlineRow({
      territorio: r.territorio,
      cidade: r.cidade,
      nomeAcao: r.nomeAcao,
    });

    if (online) {
      const label = onlineLabel({
        territorio: r.territorio,
        nomeAcao: r.nomeAcao,
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
            nomeAcao: r.nomeAcao,
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
  socioCohort: SocioCohort = "inscritos",
): Promise<{ ok: true; data: ProjetoPageData } | { ok: false; error: string }> {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (
    !perms.has("consultas:territorio") &&
    !perms.has("inscricoes:read") &&
    !perms.has("analise:read") &&
    !perms.has("contextos:read")
  ) {
    return { ok: false, error: "Sem permissão para consultar este projeto." };
  }

  const idProjeto = decodeURIComponent(idProjetoRaw).trim();
  if (!idProjeto) return { ok: false, error: "Projeto inválido." };

  const projeto = await prisma.projeto.findUnique({
    where: { id: idProjeto },
    include: {
      contexto: { select: { id: true, nome: true } },
      acoes: { orderBy: { nome: "asc" } },
    },
  });
  if (!projeto) {
    return { ok: false, error: "Projeto não encontrado." };
  }

  const allowed = await assertDataAccess(user.id, {
    contextoId: projeto.contextoId,
    idProjeto: projeto.id,
  });
  if (!allowed) {
    return { ok: false, error: "Fora do seu acesso a este projeto." };
  }

  const canManage =
    perms.has("contextos:write") ||
    perms.has("contextos:create") ||
    perms.has("import:write");
  const canEditContexto =
    canManage &&
    (await assertDataAccess(
      user.id,
      { contextoId: projeto.contextoId, idProjeto: projeto.id },
      { write: true },
    ));

  const scope = await resolveDataScope(user.id);
  const records = await prisma.inscricao.findMany({
    where: andScope(scope, { idProjeto }),
    orderBy: [{ idAcao: "asc" }, { nome: "asc" }],
  });

  const byAcao = new Map<string, AcaoResumo>();
  for (const o of projeto.acoes) {
    byAcao.set(o.id, {
      id_oficina: o.id,
      Nome_oficina: o.nome,
      inscritos: 0,
      selecionados: 0,
      participantes: 0,
      certificados: 0,
      cpfsUnicos: 0,
    });
  }

  const cpfsDaAcao = cpfsPorGrupo();
  for (const r of records) {
    const key = r.idAcao;
    const cur = byAcao.get(key) ?? {
      id_oficina: r.idAcao,
      Nome_oficina: r.nomeAcao || r.idAcao,
      inscritos: 0,
      selecionados: 0,
      participantes: 0,
      certificados: 0,
      cpfsUnicos: 0,
    };
    cpfsDaAcao.add(key, r.cpf);
    cur.cpfsUnicos = cpfsDaAcao.total(key);
    cur.inscritos += r.inscritos || 1;
    cur.selecionados += r.selecionados || 0;
    cur.participantes += r.participantes || 0;
    cur.certificados += r.certificado || 0;
    if (!cur.Nome_oficina && r.nomeAcao) cur.Nome_oficina = r.nomeAcao;
    byAcao.set(key, cur);
  }

  const acoes = [...byAcao.values()].sort((a, b) =>
    a.Nome_oficina.localeCompare(b.Nome_oficina, "pt-BR"),
  );

  const totais = acoes.reduce(
    (acc, o) => {
      acc.inscritos += o.inscritos;
      acc.selecionados += o.selecionados;
      acc.participantes += o.participantes;
      acc.certificados += o.certificados;
      return acc;
    },
    { inscritos: 0, selecionados: 0, participantes: 0, certificados: 0, cpfsUnicos: 0, acoes: 0 },
  );
  totais.acoes = acoes.length;
  // Pessoas do projeto todo (quem fez mais de uma ação conta uma vez).
  totais.cpfsUnicos = contarCpfsUnicos(records.map((r) => r.cpf));

  const emptySocio: SocioBreakdown = {
    total: 0,
    genero: [],
    etnia: [],
    escolaridade: [],
    idade: [],
    deficienca: [],
  };

  const [socio, programa] = await Promise.all([
    records.length
      ? aggregateSocio(
          andSocioCohort(andScope(scope, { idProjeto }), socioCohort),
        )
      : Promise.resolve(emptySocio),
    getContextoForProjeto(idProjeto),
  ]);

  return {
    ok: true,
    data: {
      id_projeto: idProjeto,
      Nome_projeto: projeto.nome || idProjeto,
      PROPONENTE: projeto.proponente,
      PRONAC: projeto.pronac,
      Identificacao_ano_projeto: projeto.ano,
      contextoId: projeto.contextoId,
      contextoNome: projeto.contexto.nome,
      canEditContexto,
      acoes,
      totais,
      socio,
      programa,
    },
  };
}

export async function getAcaoPageAction(
  idProjetoRaw: string,
  idAcaoRaw: string,
  socioCohort: SocioCohort = "inscritos",
): Promise<{ ok: true; data: AcaoPageData } | { ok: false; error: string }> {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (
    !perms.has("consultas:territorio") &&
    !perms.has("inscricoes:read") &&
    !perms.has("analise:read")
  ) {
    return { ok: false, error: "Sem permissão para consultar esta ação." };
  }

  const idProjeto = decodeURIComponent(idProjetoRaw).trim();
  const idAcao = decodeURIComponent(idAcaoRaw).trim();
  if (!idProjeto || !idAcao) {
    return { ok: false, error: "Projeto ou ação inválidos." };
  }

  const allowed = await assertDataAccess(user.id, {
    idProjeto,
    idAcao,
  });
  if (!allowed) {
    return { ok: false, error: "Fora do seu acesso a esta ação." };
  }

  const scope = await resolveDataScope(user.id);
  const records = await prisma.inscricao.findMany({
    where: andScope(scope, { idProjeto, idAcao }),
    orderBy: [{ nome: "asc" }],
  });

  if (records.length === 0) {
    return {
      ok: false,
      error: "Nenhum registro encontrado para esta ação neste projeto.",
    };
  }

  const first = records[0]!;
  const rows = records.map(prismaToRow);

  let selecionados = 0;
  let participantes = 0;
  let certificados = 0;
  const inscritosList: ProjetoAcaoInscrito[] = rows.map((row, i) => {
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
  const socio = await aggregateSocio(
    andSocioCohort(andScope(scope, { idProjeto, idAcao }), socioCohort),
  );

  return {
    ok: true,
    data: {
      id_projeto: idProjeto,
      Nome_projeto: first.nomeProjeto || idProjeto,
      id_oficina: idAcao,
      Nome_oficina: first.nomeAcao || idAcao,
      PROPONENTE: first.proponente,
      PRONAC: first.pronac,
      Identificacao_ano_projeto: first.identificacaoAnoProjeto,
      localizacoes,
      totais: {
        inscritos,
        selecionados,
        participantes,
        certificados,
        cpfsUnicos: contarCpfsUnicos(records.map((r) => r.cpf)),
        taxaSelecao: pct(selecionados, inscritos),
        taxaParticipacao: pct(participantes, selecionados || inscritos),
        taxaCertificado: pct(certificados, participantes || selecionados || inscritos),
      },
      inscritos: inscritosList,
      socio,
    },
  };
}
