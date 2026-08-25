import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@max/auth";

export type HubProjectSummary = {
  slug: string;
  id: string;
  code: string;
  name: string;
  lawLabel: string;
  lifecycleStatus: string;
  lifecycleLabel: string;
  situacao: string | null;
  jurisdiction: string;
  jurisdictionLabel: string;
  accountName: string;
  importSourceLabel: string;
  hasSheet: boolean;
  totalApproved: number;
  totalReserved: number;
  totalPaid: number;
  totalAvailable: number;
  commitmentsCount: number;
  documentsCount: number;
  updatedAt: string;
  origemPlanejamentoUrl: string;
  origemPainelUrl: string;
};

function origemUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_ORIGEM_URL || "http://localhost:3001").replace(
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

  return fetch(origemUrl(path), {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(session ? { "x-max-session": session } : {}),
      accept: "application/json",
    },
    cache: "no-store",
    redirect: "manual",
  });
}

async function readJson(res: Response): Promise<{
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  error?: string;
}> {
  if (res.status >= 300 && res.status < 400) {
    return {
      ok: false,
      status: res.status,
      data: {},
      error: "O Origem pediu login de novo. Saia e entre outra vez no hub.",
    };
  }

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {
      ok: false,
      status: res.status,
      data: {},
      error: "Resposta inválida do Origem ao buscar projetos.",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data,
      error: typeof data.error === "string" ? data.error : "Falha ao carregar projetos.",
    };
  }

  return { ok: true, status: res.status, data };
}

export async function fetchHubProjects(): Promise<{
  projects: HubProjectSummary[];
  error?: string;
}> {
  try {
    const res = await hubFetch("/api/hub/projects");
    const parsed = await readJson(res);
    if (!parsed.ok) {
      return { projects: [], error: parsed.error };
    }
    const projects = Array.isArray(parsed.data.projects)
      ? (parsed.data.projects as HubProjectSummary[])
      : [];
    return { projects };
  } catch {
    return {
      projects: [],
      error: "Origem indisponível. Confira se o MAX Origem está em execução na porta 3001.",
    };
  }
}

export async function fetchHubProject(
  slug: string,
): Promise<{ project: HubProjectSummary | null; error?: string }> {
  try {
    const res = await hubFetch(`/api/hub/projects/${encodeURIComponent(slug)}`);
    if (res.status === 404) return { project: null };
    const parsed = await readJson(res);
    if (!parsed.ok) {
      return { project: null, error: parsed.error };
    }
    return {
      project: (parsed.data.project as HubProjectSummary | undefined) || null,
    };
  } catch {
    return {
      project: null,
      error: "Origem indisponível. Confira se o MAX Origem está em execução na porta 3001.",
    };
  }
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
