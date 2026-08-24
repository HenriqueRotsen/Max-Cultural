import { formatRowsWithMapping, normalizeRow } from "@/lib/normalize";
import {
  ETNIAS,
  GENEROS,
  SIGACULTURAL_COLUMNS,
  type BatchContext,
  type SigaCulturalColumn,
  type SigaCulturalRow,
} from "@/lib/schema";
import {
  CONTEXT_COLUMNS,
  mapHeadersHeuristic,
  mergeAiMapping,
  type ColumnMappingResult,
} from "@/lib/column-map";
import { needsAiAddressSplit } from "@/lib/address-parse";

const DEFAULT_HOST = "http://127.0.0.1:11434";
/** Modelo leve — llama3.2 fica ~10× mais lento nesta máquina */
const DEFAULT_MODEL = "qwen2.5:1.5b";
/** Formatação local é barata; lotes só para progresso na UI */
export const BATCH_SIZE = 50;

const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 25000);
const AI_ADDRESS_BATCH = 4;
const ADDRESS_FIELDS = [
  "Lougradouro",
  "Numero",
  "Complemento",
  "Bairro",
  "CEP",
  "Cidade",
  "Estado",
] as const;

function getOllamaConfig() {
  return {
    host: (process.env.OLLAMA_HOST || DEFAULT_HOST).replace(/\/$/, ""),
    model: process.env.OLLAMA_MODEL || DEFAULT_MODEL,
  };
}

export type OllamaGenerateResult = {
  response: string;
  raw: unknown;
};

export async function generateStructured(
  prompt: string,
  system?: string,
  options?: { numPredict?: number; timeoutMs?: number },
): Promise<OllamaGenerateResult> {
  const { host, model } = getOllamaConfig();
  const timeoutMs = options?.timeoutMs ?? OLLAMA_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        system,
        format: "json",
        stream: false,
        keep_alive: "10m",
        options: {
          temperature: 0.1,
          num_predict: options?.numPredict ?? 500,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama error ${res.status}: ${text || res.statusText}`);
    }

    const data = (await res.json()) as { response?: string };
    return {
      response: data.response ?? "{}",
      raw: data,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `IA demorou mais de ${Math.round(timeoutMs / 1000)}s. Tente de novo ou use o mapeamento automático.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function slimSamples(
  headers: string[],
  samples: Record<string, unknown>[],
): Record<string, unknown>[] {
  return samples.slice(0, 2).map((row) => {
    const slim: Record<string, unknown> = {};
    for (const h of headers) {
      const v = row[h];
      const s = String(v ?? "").trim();
      slim[h] = s.length > 80 ? `${s.slice(0, 80)}…` : s;
    }
    return slim;
  });
}

function buildColumnMapPrompt(
  headers: string[],
  samples: Record<string, unknown>[],
  availableTargets: string[],
): string {
  return `Mapeie cabeçalhos de planilha → colunas oficiais MAX Fluxo.
JSON: {"mapping":{"<origem>":"<oficial>"|null}}

Targets permitidos (use exatamente):
${availableTargets.join(", ")}

Regras:
- Só mapeie correspondência clara; senão null
- Cada target no máximo 1 vez
- Ignore carimbo/timestamp/pergunta de escolha de oficina
- Cabeçalhos "Endereço completo (Rua, número, bairro, cidade, CEP…)" → Lougradouro (o sistema divide depois)

Cabeçalhos:
${JSON.stringify(headers)}

Amostras:
${JSON.stringify(slimSamples(headers, samples))}
`;
}

function parseMappingJson(response: string): Record<string, string | null> {
  const parsed = JSON.parse(response) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSON de mapeamento inválido");
  }
  const obj = parsed as Record<string, unknown>;
  const mapping = (obj.mapping ?? obj) as Record<string, unknown>;
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(mapping)) {
    if (v === null || v === undefined || v === "" || v === "null") {
      out[k] = null;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * Heurística primeiro. IA só se `useAi: true` (último caso / botão explícito).
 */
export async function resolveColumnMapping(
  headers: string[],
  sampleRows: Record<string, unknown>[] = [],
  options: { useAi?: boolean } = {},
): Promise<ColumnMappingResult> {
  const heuristic = mapHeadersHeuristic(headers, sampleRows);
  const useAi = options.useAi === true;

  if (!useAi) {
    return heuristic;
  }

  const unresolved = heuristic.entries
    .filter((e) => !e.target)
    .map((e) => e.source);

  if (unresolved.length === 0) {
    return { ...heuristic, usedAi: true };
  }

  const used = new Set(heuristic.mappedTargets);
  const availableTargets = SIGACULTURAL_COLUMNS.filter(
    (c) => !CONTEXT_COLUMNS.includes(c) && !used.has(c),
  );

  try {
    // lotes pequenos = resposta mais rápida no Ollama local
    let merged = heuristic;
    const CHUNK = 10;
    for (let i = 0; i < unresolved.length; i += CHUNK) {
      const chunk = unresolved.slice(i, i + CHUNK);
      const stillUsed = new Set(merged.mappedTargets);
      const targets = availableTargets.filter((t) => !stillUsed.has(t));
      if (targets.length === 0) break;

      const { response } = await generateStructured(
        buildColumnMapPrompt(chunk, sampleRows, targets),
        "Retorne só JSON com a chave mapping.",
        { numPredict: 350, timeoutMs: OLLAMA_TIMEOUT_MS },
      );
      const aiMap = parseMappingJson(response);
      merged = mergeAiMapping(merged, aiMap);
    }
    return { ...merged, usedAi: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no Ollama";
    return {
      ...heuristic,
      usedAi: false,
      aiError: message,
    };
  }
}

export type FormatBatchResult = {
  rows: SigaCulturalRow[];
  offset: number;
  batchSize: number;
  processedCount: number;
};

/**
 * Formata valores só das colunas mapeadas (local/determinístico — sem IA por linha).
 */
export function formatMappedBatch(
  rawRows: Record<string, unknown>[],
  mapping: Record<string, SigaCulturalColumn>,
  context: BatchContext,
  offset = 0,
  batchSize = BATCH_SIZE,
): FormatBatchResult {
  const chunk = rawRows.slice(offset, offset + batchSize);
  const rows = formatRowsWithMapping(chunk, mapping, context);
  return {
    rows,
    offset,
    batchSize,
    processedCount: chunk.length,
  };
}

const AI_VALUE_BATCH = 8;

/**
 * Reprocessa valores de colunas escolhidas com IA (último recurso).
 * Envia só as chaves pedidas + contexto mínimo.
 */
export async function reprocessValuesWithAi(
  rows: SigaCulturalRow[],
  columns: SigaCulturalColumn[],
  context: BatchContext,
): Promise<SigaCulturalRow[]> {
  if (rows.length === 0 || columns.length === 0) return rows;

  const result = [...rows];
  // evita mandar a planilha inteira de uma vez para a IA
  const maxRows = Math.min(rows.length, 40);

  for (let i = 0; i < maxRows; i += AI_VALUE_BATCH) {
    const chunk = rows.slice(i, i + AI_VALUE_BATCH);
    const slim = chunk.map((row, idx) => {
      const partial: Record<string, unknown> = { _i: idx };
      for (const col of columns) {
        const v = String(row[col] ?? "");
        partial[col] = v.length > 60 ? `${v.slice(0, 60)}…` : v;
      }
      return partial;
    });

    const prompt = `Padronize valores MAX Fluxo. JSON: {"rows":[{"_i":0,...}]}
Colunas: ${columns.join(", ")}
CPF=11 digitos; Telefone=(XX) XXXXX-XXXX; CEP=8 digitos; Genero=${GENEROS.slice(0, 3).join("|")}; Etnia=${ETNIAS.slice(0, 4).join("|")}; PCD=Sim|Não; UF=2 letras; datas=DD/MM/YYYY
Contexto: projeto=${context.id_projeto} oficina=${context.id_oficina}
Linhas: ${JSON.stringify(slim)}
`;

    try {
      const { response } = await generateStructured(
        prompt,
        "Retorne apenas JSON válido.",
        { numPredict: 700, timeoutMs: OLLAMA_TIMEOUT_MS },
      );
      const parsed = JSON.parse(response) as { rows?: Record<string, unknown>[] };
      const aiRows = Array.isArray(parsed.rows) ? parsed.rows : [];
      for (const ai of aiRows) {
        const idx = Number(ai._i);
        if (!Number.isFinite(idx) || !chunk[idx]) continue;
        const globalIdx = i + idx;
        const merged = { ...result[globalIdx] } as Record<string, unknown>;
        for (const col of columns) {
          if (col in ai) merged[col] = ai[col];
        }
        result[globalIdx] = normalizeRow(merged, context);
      }
    } catch {
      // mantém valores atuais do lote em caso de falha
    }
  }

  return result.map((row) => normalizeRow(row, context));
}

/**
 * Usa a IA para dividir/ajustar endereços em Logradouro/Número/Bairro/CEP/…
 */
export async function expandFullAddressesWithAi(
  rows: SigaCulturalRow[],
  context: BatchContext,
): Promise<{ rows: SigaCulturalRow[]; expanded: number; error?: string }> {
  const indices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (needsAiAddressSplit(rows[i]!)) indices.push(i);
  }
  if (indices.length === 0) {
    return { rows, expanded: 0 };
  }

  const result = [...rows];
  let expanded = 0;
  let lastError: string | undefined;

  for (let b = 0; b < indices.length; b += AI_ADDRESS_BATCH) {
    const sliceIdx = indices.slice(b, b + AI_ADDRESS_BATCH);
    const slim = sliceIdx.map((rowIdx, j) => {
      const row = result[rowIdx]!;
      return {
        _i: j,
        endereco: String(row.Lougradouro ?? "").slice(0, 280),
        Numero: String(row.Numero ?? ""),
        Complemento: String(row.Complemento ?? ""),
        Bairro: String(row.Bairro ?? ""),
        CEP: String(row.CEP ?? ""),
        Cidade: String(row.Cidade ?? ""),
        Estado: String(row.Estado ?? ""),
      };
    });

    const prompt = `Você é especialista em endereços do Brasil. Ajuste e separe cada registro.
JSON: {"rows":[{"_i":0,"Lougradouro":"","Numero":"","Complemento":"","Bairro":"","CEP":"","Cidade":"","Estado":""}]}

Campo Lougradouro (obrigatório começar com UM destes tipos por extenso):
Rua | Avenida | Praça | Travessa | Rodovia | Alameda | Estrada

Regras de qualidade:
1. Se o texto for endereço completo, divida em todos os campos.
2. Lougradouro = tipo + nome da via, SEM número. Ex.: "Rua Dom Pedro II", "Avenida Paulista".
3. Expanda abreviações: R./Rua→Rua, Av.→Avenida, Trav./Tv.→Travessa, Al.→Alameda, Pc./Pça.→Praça, Rod.→Rodovia, Est.→Estrada.
4. Se o tipo estiver ausente mas for claramente uma via urbana, use "Rua" (salvo se o nome indicar avenida/praça/etc.).
5. Numero = só o número predial ou "S/N". Não deixe número no Lougradouro.
6. Complemento = apto, bloco, casa, quadra, lote, fundos… (sem repetir bairro/cidade).
7. Bairro, Cidade com nome próprio; Estado = UF com 2 letras (SP, MA, RJ…).
8. CEP = 8 dígitos sem hífen, ou "".
9. Não invente bairro/cidade/CEP/UF que não estejam no texto ou nos campos já preenchidos.
10. Preserve informações já preenchidas se o endereco não trouxer dado melhor.
11. Cada _i da entrada deve aparecer na saída.

Exemplos:
- "R. das Flores, 123, Apt 45, Centro, São Paulo - SP, 01234-567"
  → Lougradouro="Rua Das Flores", Numero="123", Complemento="Apt 45", Bairro="Centro", Cidade="São Paulo", Estado="SP", CEP="01234567"
- "av paulista 1000 bela vista"
  → Lougradouro="Avenida Paulista", Numero="1000", Bairro="Bela Vista"
- "Dom Pedro II"
  → Lougradouro="Rua Dom Pedro II"

Entrada:
${JSON.stringify(slim)}
`;

    try {
      const { response } = await generateStructured(
        prompt,
        "Retorne apenas JSON válido. Lougradouro deve começar com Rua, Avenida, Praça, Travessa, Rodovia, Alameda ou Estrada.",
        { numPredict: 1100, timeoutMs: OLLAMA_TIMEOUT_MS },
      );
      const parsed = JSON.parse(response) as {
        rows?: Record<string, unknown>[];
      };
      const aiRows = Array.isArray(parsed.rows) ? parsed.rows : [];
      for (const ai of aiRows) {
        const local = Number(ai._i);
        if (!Number.isFinite(local) || local < 0 || local >= sliceIdx.length) {
          continue;
        }
        const globalIdx = sliceIdx[local]!;
        const merged = { ...result[globalIdx] } as Record<string, unknown>;
        for (const col of ADDRESS_FIELDS) {
          if (!(col in ai)) continue;
          const nextVal = String(ai[col] ?? "").trim();
          if (!nextVal) continue;
          const current = String(merged[col] ?? "").trim();
          // Lougradouro sempre atualiza (padronização do tipo de via).
          // Demais campos: preenche vazio ou substitui se o valor atual parece incompleto.
          if (
            col === "Lougradouro" ||
            !current ||
            (col === "Estado" && current.length !== 2)
          ) {
            merged[col] = nextVal;
          }
        }
        result[globalIdx] = normalizeRow(merged, context);
        expanded += 1;
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Falha ao dividir endereços com IA";
    }
  }

  return { rows: result, expanded, error: lastError };
}

/** @deprecated use resolveColumnMapping + formatMappedBatch */
export async function processSpreadsheetWithOllama(
  rawRows: Record<string, unknown>[],
  context: BatchContext,
  offset = 0,
  batchSize = BATCH_SIZE,
): Promise<FormatBatchResult & { usedFallback?: boolean; error?: string }> {
  const headers = rawRows[0] ? Object.keys(rawRows[0]) : [];
  const mappingResult = await resolveColumnMapping(headers, rawRows.slice(0, 5), {
    useAi: false,
  });
  const batch = formatMappedBatch(
    rawRows,
    mappingResult.mapping,
    context,
    offset,
    batchSize,
  );
  return {
    ...batch,
    usedFallback: true,
    error: mappingResult.aiError,
  };
}
