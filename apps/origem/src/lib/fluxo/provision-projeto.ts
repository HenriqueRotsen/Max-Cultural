import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@max/auth";

export type FluxoContextoOption = { id: string; nome: string; stem: string };

export type FluxoContextResolve = {
  stem: string;
  suggestedNome: string;
  status: "matched" | "ambiguous" | "none";
  contexto: { id: string; nome: string } | null;
  candidates: Array<{ id: string; nome: string }>;
};

export type FluxoProvisionResult =
  | {
      ok: true;
      created: boolean;
      contextoCreated?: boolean;
      projetoId: string;
      contextoId: string;
      contextoNome: string;
    }
  | { ok: false; error: string; needsContexto?: FluxoContextResolve };

function fluxoBaseUrl() {
  return (process.env.NEXT_PUBLIC_FLUXO_URL || "http://localhost:3002").replace(
    /\/$/,
    "",
  );
}

async function fluxoHubFetch(path: string, init?: RequestInit) {
  const jar = await cookies();
  const session = jar.get(AUTH_COOKIE)?.value;
  const cookie = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return fetch(`${fluxoBaseUrl()}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
      ...(cookie ? { cookie } : {}),
      ...(session ? { "x-max-session": session } : {}),
    },
    cache: "no-store",
  });
}

export async function listFluxoContextos(q?: string): Promise<FluxoContextoOption[]> {
  try {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    const res = await fluxoHubFetch(`/api/hub/contextos${qs}`);
    const json = (await res.json()) as {
      contextos?: FluxoContextoOption[];
      error?: string;
    };
    if (!res.ok) return [];
    return json.contextos ?? [];
  } catch {
    return [];
  }
}

export async function resolveFluxoContexto(
  nome: string,
): Promise<FluxoContextResolve | null> {
  try {
    const res = await fluxoHubFetch(
      `/api/hub/contextos/resolve?nome=${encodeURIComponent(nome.trim())}`,
    );
    const json = (await res.json()) as {
      resolve?: FluxoContextResolve;
      error?: string;
    };
    if (!res.ok) return null;
    return json.resolve ?? null;
  } catch {
    return null;
  }
}

/** Espelha projeto do planejamento no MAX Fluxo (não bloqueia o fluxo Origem). */
export async function provisionFluxoProjeto(params: {
  pronac: string;
  nome: string;
  proponente?: string;
  ano?: string;
  contextoId?: string;
  contextoNome?: string;
  createContexto?: boolean;
  autoMatchContexto?: boolean;
}): Promise<FluxoProvisionResult> {
  try {
    const res = await fluxoHubFetch("/api/hub/projetos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });

    const json = (await res.json()) as Record<string, unknown>;

    if (res.status === 409 && json.code === "NEEDS_CONTEXTO") {
      return {
        ok: false,
        error:
          typeof json.error === "string"
            ? json.error
            : "Vincule ou cadastre um contexto no Fluxo.",
        needsContexto: json.resolve as FluxoContextResolve,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof json.error === "string"
            ? json.error
            : "Falha ao provisionar no Fluxo.",
      };
    }

    const projeto = json.projeto as Record<string, unknown> | undefined;
    return {
      ok: true,
      created: Boolean(json.created),
      contextoCreated: Boolean(json.contextoCreated),
      projetoId: typeof projeto?.id === "string" ? projeto.id : "",
      contextoId: typeof projeto?.contextoId === "string" ? projeto.contextoId : "",
      contextoNome:
        typeof projeto?.contextoNome === "string" ? projeto.contextoNome : "",
    };
  } catch {
    return {
      ok: false,
      error: "Fluxo indisponível. Confira se o MAX Fluxo está em execução.",
    };
  }
}
