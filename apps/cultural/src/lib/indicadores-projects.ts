import { cookies, headers } from "next/headers";
import { firstValidSessionToken } from "@max/auth";

export type IndicadoresSocioBucket = {
  label: string;
  count: number;
  pct: number;
};

export type IndicadoresSocioBreakdown = {
  total: number;
  genero: IndicadoresSocioBucket[];
  etnia: IndicadoresSocioBucket[];
  escolaridade: IndicadoresSocioBucket[];
  idade: IndicadoresSocioBucket[];
  deficienca: IndicadoresSocioBucket[];
};

export type IndicadoresHubSummary = {
  found: boolean;
  pronac: string;
  projetos: Array<{
    id: string;
    nome: string;
    proponente: string;
    ano: string;
    acoesCount: number;
    url: string;
  }>;
  totais: {
    inscritos: number;
    selecionados: number;
    participantes: number;
    certificados: number;
    acoes: number;
    registros: number;
    taxaSelecao: number;
    taxaParticipacao: number;
    taxaCertificado: number;
  };
  topEstados: Array<{ estado: string; inscritos: number }>;
  socio?: IndicadoresSocioBreakdown;
  socioByCohort?: {
    inscritos: IndicadoresSocioBreakdown;
    selecionados: IndicadoresSocioBreakdown;
    certificados: IndicadoresSocioBreakdown;
  };
  indicadoresUrl: string;
};

function indicadoresUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_INDICADORES_URL || "http://localhost:3002").replace(
    /\/$/,
    "",
  );
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function hubFetch(path: string) {
  const jar = await cookies();
  // Cópia válida do cookie: em homologação o cookie da produção também chega (assinatura diferente).
  const session = (await firstValidSessionToken((await headers()).get("cookie"))) ?? undefined;
  const cookie = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return fetch(indicadoresUrl(path), {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(session ? { "x-max-session": session } : {}),
      accept: "application/json",
    },
    cache: "no-store",
    redirect: "manual",
  });
}

/** Indicadores antigo (antes de Oficina virar Ação) responde `oficinas`/`oficinasCount`. */
function normalizeLegacy(data: IndicadoresHubSummary): IndicadoresHubSummary {
  const legacy = data as unknown as {
    totais?: { oficinas?: number };
    projetos?: Array<{ oficinasCount?: number }>;
  };
  return {
    ...data,
    totais: { ...data.totais, acoes: data.totais?.acoes ?? legacy.totais?.oficinas ?? 0 },
    projetos: (data.projetos || []).map((p, i) => ({
      ...p,
      acoesCount: p.acoesCount ?? legacy.projetos?.[i]?.oficinasCount ?? 0,
    })),
  };
}

export async function fetchIndicadoresByPronac(
  pronac: string,
): Promise<{ data: IndicadoresHubSummary | null; error?: string }> {
  try {
    const res = await hubFetch(`/api/hub/by-pronac/${encodeURIComponent(pronac)}`);
    if (res.status >= 300 && res.status < 400) {
      return {
        data: null,
        error: "O MAX Indicadores pediu login de novo. Saia e entre outra vez no hub.",
      };
    }
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return { data: null, error: "Resposta inválida do MAX Indicadores." };
    }
    if (!res.ok) {
      return {
        data: null,
        error: typeof json.error === "string" ? json.error : "Falha ao carregar o MAX Indicadores.",
      };
    }
    return { data: normalizeLegacy(json as unknown as IndicadoresHubSummary) };
  } catch {
    return {
      data: null,
      error: "MAX Indicadores indisponível. Confira se o MAX Indicadores está em execução na porta 3002.",
    };
  }
}
