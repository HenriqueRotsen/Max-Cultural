const SALIC_API_BASE = "https://api.salic.cultura.gov.br/api/v1";

export type SalicLinks = {
  self?: string;
  first?: string;
  next?: string;
  prev?: string;
  last?: string;
  [key: string]: string | undefined;
};

export type SalicListResponse<T> = {
  _embedded?: Record<string, T[]>;
  _links?: SalicLinks;
  count?: number;
  total?: number;
};

export type SalicProjeto = {
  PRONAC?: string;
  nome?: string;
  proponente?: string;
  cgccpf?: string;
  situacao?: string;
  area?: string;
  segmento?: string;
  valor_captado?: number | string;
  valor_aprovado?: number | string;
  valor_projeto?: number | string;
  valor_proposta?: number | string;
  valor_solicitado?: number | string;
  _links?: SalicLinks;
};

export type SalicFornecedor = {
  cgccpf?: string;
  nome?: string;
  email?: string;
  _links?: SalicLinks & { produtos?: string; self?: string };
};

export type SalicProduto = {
  nome?: string;
  id_comprovante_pagamento?: number | string;
  id_planilha_aprovacao?: number | string;
  cgccpf?: string;
  nome_fornecedor?: string;
  data_aprovacao?: string;
  PRONAC?: string;
  tipo_documento?: string;
  nr_comprovante?: string;
  data_pagamento?: string;
  tipo_forma_pagamento?: string;
  nr_documento_pagamento?: string;
  valor_pagamento?: number;
  id_arquivo?: number | string;
  justificativa?: string;
  nm_arquivo?: string;
  _links?: SalicLinks;
};

export type SalicProponente = {
  nome?: string;
  cgccpf?: string;
  municipio?: string;
  UF?: string;
  _links?: SalicLinks;
};

type Query = Record<string, string | number | undefined | null>;

function buildUrl(path: string, query: Query = {}): string {
  const url = new URL(`${SALIC_API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    if (/aborted|abort/i.test(error.message)) return true;
  }
  return false;
}

function timeoutError(path: string, timeoutMs: number, attempts: number): Error {
  return new Error(
    `Timeout na API SALIC após ${Math.round(timeoutMs / 1000)}s (${attempts} tentativa(s)): ${path}. A API pública pode estar lenta ou indisponível — tente de novo em alguns minutos ou use o crawler.`,
  );
}

async function salicFetch<T>(
  path: string,
  query: Query = {},
  attempt = 1,
  options?: { timeoutMs?: number; maxAttempts?: number },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 25_000;
  const maxAttempts = options?.maxAttempts ?? 2;
  const url = buildUrl(path, query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; SalinkAuditor/1.0; +https://localhost)",
      },
      next: { revalidate: 0 },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (attempt < maxAttempts) {
      // Backoff maior em abort/timeout — evita martelar a API quando ela trava
      await sleep(isAbortError(error) ? 1500 * attempt : 500 * attempt * attempt);
      return salicFetch<T>(path, query, attempt + 1, options);
    }
    if (isAbortError(error)) {
      throw timeoutError(path, timeoutMs, attempt);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // API returns 404 when filters match nothing — treat as empty collection.
    if (res.status === 404) {
      try {
        const parsed = JSON.parse(body) as { message_code?: number | string };
        if (parsed.message_code === 11 || parsed.message_code === "11") {
          return {
            _embedded: {},
            count: 0,
            total: 0,
          } as T;
        }
      } catch {
        // fall through
      }
    }

    if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
      await sleep(600 * attempt * attempt);
      return salicFetch<T>(path, query, attempt + 1, options);
    }

    throw new Error(`SALIC API ${res.status} ${url}: ${body.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

function extractIdFromSelf(self?: string): string | undefined {
  if (!self) return undefined;
  const parts = self.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || undefined;
}

export async function* paginateEmbedded<T>(
  path: string,
  embeddedKey: string,
  query: Query = {},
  pageSize = 100,
): AsyncGenerator<T, void, unknown> {
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const page = await salicFetch<SalicListResponse<T>>(path, {
      ...query,
      limit: pageSize,
      offset,
    });
    const items = page._embedded?.[embeddedKey] ?? [];
    total = page.total ?? items.length;
    for (const item of items) {
      yield item;
    }
    if (items.length === 0) break;
    offset += items.length;
    if (!page._links?.next) break;
    await sleep(120);
  }
}

export async function listProjetosByCgccpf(cgccpf: string) {
  const items: SalicProjeto[] = [];
  for await (const projeto of paginateEmbedded<SalicProjeto>(
    "/projetos",
    "projetos",
    { cgccpf },
  )) {
    items.push(projeto);
  }
  return items;
}

/** Metadados financeiros de um PRONAC na API pública (valor captado / aprovado). */
export async function getProjetoByPronac(pronac: string): Promise<SalicProjeto | null> {
  const page = await salicFetch<SalicListResponse<SalicProjeto>>("/projetos", {
    PRONAC: pronac,
    limit: 1,
  });
  return page._embedded?.projetos?.[0] ?? null;
}

export function parseSalicMoney(value?: number | string | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function listFornecedoresByPronac(pronac: string) {
  const items: Array<SalicFornecedor & { salicId?: string }> = [];
  for await (const fornecedor of paginateEmbedded<SalicFornecedor>(
    "/fornecedores",
    "fornecedores",
    { PRONAC: pronac },
  )) {
    items.push({
      ...fornecedor,
      salicId: extractIdFromSelf(fornecedor._links?.self),
    });
  }
  return items;
}

export async function listProdutosByFornecedor(fornecedorId: string) {
  const items: SalicProduto[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const pageSize = 100;

  while (offset < total) {
    const page = await salicFetch<{
      _embedded?: { produtos?: SalicProduto[] };
      _links?: SalicLinks;
      total?: number;
    }>(
      `/fornecedores/${fornecedorId}/produtos`,
      { limit: pageSize, offset },
      1,
      { timeoutMs: 30_000, maxAttempts: 2 },
    );
    const batch = page._embedded?.produtos ?? [];
    total = page.total ?? batch.length;
    items.push(...batch);
    if (batch.length === 0) break;
    offset += batch.length;
    if (!page._links?.next) break;
    await sleep(80);
  }

  return items;
}

export async function searchFornecedores(params: {
  nome?: string;
  cgccpf?: string;
}) {
  const items: Array<SalicFornecedor & { salicId?: string }> = [];
  for await (const fornecedor of paginateEmbedded<SalicFornecedor>(
    "/fornecedores",
    "fornecedores",
    params,
    50,
  )) {
    items.push({
      ...fornecedor,
      salicId: extractIdFromSelf(fornecedor._links?.self),
    });
  }
  return items;
}

export async function searchProponentes(params: {
  nome?: string;
  cgccpf?: string;
}) {
  const items: SalicProponente[] = [];
  for await (const proponente of paginateEmbedded<SalicProponente>(
    "/proponentes",
    "proponentes",
    params,
    50,
  )) {
    items.push(proponente);
  }
  return items;
}

export { extractIdFromSelf, SALIC_API_BASE };
