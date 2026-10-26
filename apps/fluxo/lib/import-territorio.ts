import type { BatchContext } from "@/lib/schema";
import {
  buildOficinaTerritorioOpcoes,
  normalizeTerritorioRawKey,
  parseTerritorioInscricao,
  resolveOficinaTerritorioChoice,
  type OficinaTerritorioAliasRef,
  type OficinaTerritorioCatalog,
} from "@/lib/oficina-territorio";

/**
 * Território da oficina no import: a planilha nunca cria território novo.
 * - "lote": uma opção da oficina vale para todas as linhas;
 * - "planilha": cada valor distinto da coluna Território é ligado a uma opção
 *   da oficina; linhas sem valor usam `lote`.
 */
export type TerritorioImportState = {
  modo: "lote" | "planilha";
  lote: string;
  mapa: Record<string, string>;
};

export type TerritorioValorPlanilha = { raw: string; count: number };

export function territorioOpcoes(catalog: OficinaTerritorioCatalog | null | undefined): string[] {
  return catalog ? buildOficinaTerritorioOpcoes(catalog) : [];
}

/** Valores distintos (como vieram) das colunas mapeadas para Território. */
export function distinctTerritorioValues(
  rawRows: Record<string, unknown>[],
  sources: string[],
): { values: TerritorioValorPlanilha[]; blankCount: number } {
  const byKey = new Map<string, TerritorioValorPlanilha>();
  let blankCount = 0;
  for (const row of rawRows) {
    let raw = "";
    for (const s of sources) {
      const v = String(row[s] ?? "").trim();
      if (v) {
        raw = v;
        break;
      }
    }
    if (!raw) {
      blankCount += 1;
      continue;
    }
    const key = normalizeTerritorioRawKey(raw);
    const hit = byKey.get(key);
    if (hit) hit.count += 1;
    else byKey.set(key, { raw, count: 1 });
  }
  const values = [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.raw.localeCompare(b.raw, "pt-BR"),
  );
  return { values, blankCount };
}

/** Estado inicial: opção única vira lote; senão sugere o que já casa com o catálogo/aliases. */
export function initialTerritorioState(
  catalog: OficinaTerritorioCatalog | null | undefined,
  values: TerritorioValorPlanilha[],
): TerritorioImportState {
  const opcoes = territorioOpcoes(catalog);
  if (opcoes.length === 1) return { modo: "lote", lote: opcoes[0]!, mapa: {} };
  const mapa: Record<string, string> = {};
  for (const v of values) {
    const parsed = parseTerritorioInscricao(v.raw, catalog);
    if ((parsed.matched || parsed.online) && opcoes.includes(parsed.label)) {
      mapa[v.raw] = parsed.label;
    }
  }
  return { modo: values.length ? "planilha" : "lote", lote: "", mapa };
}

/** O que falta escolher antes de seguir (null = pronto). */
export function territorioPendencia(
  state: TerritorioImportState,
  opcoes: string[],
  values: TerritorioValorPlanilha[],
  blankCount: number,
): string | null {
  if (opcoes.length === 0) {
    return "A oficina não tem território cadastrado. Edite a oficina e informe onde ela acontece.";
  }
  if (state.modo === "lote" || values.length === 0) {
    return opcoes.includes(state.lote)
      ? null
      : "Escolha o território da oficina para este lote.";
  }
  const faltando = values.filter((v) => !opcoes.includes(state.mapa[v.raw] ?? ""));
  if (faltando.length) {
    return `Ligue ${faltando.length} valor(es) da planilha a um território da oficina.`;
  }
  if (blankCount > 0 && !opcoes.includes(state.lote)) {
    return "Escolha o território para as linhas sem território na planilha.";
  }
  return null;
}

function aliasForLabel(
  raw: string,
  label: string,
  catalog: OficinaTerritorioCatalog,
): OficinaTerritorioAliasRef | null {
  const choice = resolveOficinaTerritorioChoice(label, catalog);
  if (!choice.matched) return null;
  return {
    rawNormalized: normalizeTerritorioRawKey(raw),
    online: choice.online,
    oficinaTerritorioId: choice.oficinaTerritorioId,
  };
}

/** Ligações valor da planilha → território a gravar como alias da oficina. */
export function territorioAliasesFromState(
  state: TerritorioImportState,
  catalog: OficinaTerritorioCatalog,
  values: TerritorioValorPlanilha[],
): Array<{ raw: string; online: boolean; oficinaTerritorioId: string | null }> {
  if (state.modo !== "planilha") return [];
  const out: Array<{ raw: string; online: boolean; oficinaTerritorioId: string | null }> = [];
  for (const v of values) {
    const alias = aliasForLabel(v.raw, state.mapa[v.raw] ?? "", catalog);
    if (alias) {
      out.push({
        raw: v.raw,
        online: alias.online,
        oficinaTerritorioId: alias.oficinaTerritorioId ?? null,
      });
    }
  }
  return out;
}

/** Contexto do lote com o território escolhido (as ligações valem já, sem esperar o banco). */
export function applyTerritorioToContext<T extends BatchContext>(
  context: T,
  state: TerritorioImportState,
  values: TerritorioValorPlanilha[],
): T {
  const catalog = context.oficinaTerritorioCatalog;
  if (!catalog) return context;
  if (state.modo === "lote" || values.length === 0) {
    return { ...context, territorioLote: state.lote, territorioLoteModo: "todos" };
  }
  const novos = territorioAliasesFromState(state, catalog, values).map((a) => ({
    rawNormalized: normalizeTerritorioRawKey(a.raw),
    online: a.online,
    oficinaTerritorioId: a.oficinaTerritorioId,
  }));
  const keys = new Set(novos.map((a) => a.rawNormalized));
  return {
    ...context,
    territorioLote: state.lote,
    territorioLoteModo: "vazios",
    oficinaTerritorioCatalog: {
      ...catalog,
      aliases: [...(catalog.aliases ?? []).filter((a) => !keys.has(a.rawNormalized)), ...novos],
    },
  };
}
