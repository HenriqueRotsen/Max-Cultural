import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@max/auth";

export type FluxoSocioBucket = {
  label: string;
  count: number;
  pct: number;
};

export type FluxoSocioBreakdown = {
  total: number;
  genero: FluxoSocioBucket[];
  etnia: FluxoSocioBucket[];
  escolaridade: FluxoSocioBucket[];
  idade: FluxoSocioBucket[];
  deficienca: FluxoSocioBucket[];
};

export type FluxoHubSummary = {
  found: boolean;
  pronac: string;
  projetos: Array<{
    id: string;
    nome: string;
    proponente: string;
    ano: string;
    oficinasCount: number;
    url: string;
  }>;
  totais: {
    inscritos: number;
    selecionados: number;
    participantes: number;
    certificados: number;
    oficinas: number;
    registros: number;
    taxaSelecao: number;
    taxaParticipacao: number;
    taxaCertificado: number;
  };
  topEstados: Array<{ estado: string; inscritos: number }>;
  socio?: FluxoSocioBreakdown;
  fluxoUrl: string;
};

function fluxoUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_FLUXO_URL || "http://localhost:3002").replace(
    /\/$/,
    "",
  );
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function hubFetch(path: string) {
  const jar = await cookies();
  const session = jar.get(AUTH_COOKIE)?.value;
  const cookie = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return fetch(fluxoUrl(path), {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(session ? { "x-max-session": session } : {}),
      accept: "application/json",
    },
    cache: "no-store",
    redirect: "manual",
  });
}

export async function fetchFluxoByPronac(
  pronac: string,
): Promise<{ data: FluxoHubSummary | null; error?: string }> {
  try {
    const res = await hubFetch(`/api/hub/by-pronac/${encodeURIComponent(pronac)}`);
    if (res.status >= 300 && res.status < 400) {
      return {
        data: null,
        error: "O Fluxo pediu login de novo. Saia e entre outra vez no hub.",
      };
    }
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return { data: null, error: "Resposta inválida do Fluxo." };
    }
    if (!res.ok) {
      return {
        data: null,
        error: typeof json.error === "string" ? json.error : "Falha ao carregar o Fluxo.",
      };
    }
    return { data: json as unknown as FluxoHubSummary };
  } catch {
    return {
      data: null,
      error: "Fluxo indisponível. Confira se o MAX Fluxo está em execução na porta 3002.",
    };
  }
}
