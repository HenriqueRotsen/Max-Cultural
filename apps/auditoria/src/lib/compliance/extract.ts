import type { ComplianceCaps } from "@/lib/compliance/defaults";
import { DEFAULT_CAPS } from "@/lib/compliance/defaults";

export type CapsExtraction = {
  caps: ComplianceCaps;
  confidence: "high" | "low";
  notes: string[];
  sourceCode: string | null;
  versionHint: string | null;
};

function pctFromMatch(match: RegExpMatchArray | null, group = 1): number | null {
  if (!match?.[group]) return null;
  const n = Number(match[group].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrai tetos dos arts. 23/24 a partir do texto da IN no gov.br.
 * Confiança alta só se achar os três percentuais esperados no contexto certo.
 */
export function extractCapsFromNormText(rawText: string): CapsExtraction {
  const text = rawText.replace(/\s+/g, " ");
  const notes: string[] = [];

  const sourceMatch = text.match(
    /INSTRU[CÇ][AÃ]O\s+NORMATIVA\s+MINC\s+N[ºo°]?\s*(\d+)\s*,?\s*DE\s+\d+\s+DE\s+[A-ZÇÃÕÉÍÓÚÂÊÔ]+\s+DE\s+(\d{4})/i,
  );
  const sourceCode = sourceMatch
    ? `IN MinC nº ${sourceMatch[1]}/${sourceMatch[2]}`
    : null;
  const versionHint = sourceMatch ? `in-minc-${sourceMatch[1]}-${sourceMatch[2]}` : null;

  const art23 =
    text.match(
      /Art\.\s*23\.[^\.]{0,400}?n[aã]o ultrapassem\s+(\d+)\s*%[^\.]{0,200}?valor captado/i,
    ) ||
    text.match(
      /Art\.\s*23\.[^\.]{0,400}?ultrapassem\s+(\d+)\s*%\s*\([^)]+\)\s*do valor captado/i,
    );

  const art23Mei =
    text.match(
      /Art\.\s*23[\s\S]{0,1200}?pessoa f[ií]sica ou microempreendedor individual[^\.]{0,120}?at[eé]\s+(\d+)\s*%/i,
    ) ||
    text.match(
      /microempreendedor individual[^\.]{0,80}?limitado a at[eé]\s+(\d+)\s*%/i,
    );

  const art24 =
    text.match(
      /Art\.\s*24\.[^\.]{0,300}?acima de\s+(\d+)\s*%\s*\([^)]+\)\s*do valor captado/i,
    ) ||
    text.match(/Art\.\s*24\.[^\.]{0,300}?acima de\s+(\d+)\s*%/i);

  const proponentCapPct = pctFromMatch(art23) ?? DEFAULT_CAPS.proponentCapPct;
  const proponentMeiCapPct = pctFromMatch(art23Mei) ?? DEFAULT_CAPS.proponentMeiCapPct;
  const supplierCapPct = pctFromMatch(art24) ?? DEFAULT_CAPS.supplierCapPct;

  if (!art23) notes.push("Não localizou percentual do caput do art. 23 com alta precisão");
  if (!art23Mei) notes.push("Não localizou teto PF/MEI do art. 23 §2º");
  if (!art24) notes.push("Não localizou percentual do art. 24");

  const foundAll = Boolean(art23 && art23Mei && art24);
  const plausible =
    proponentCapPct > 0 &&
    proponentCapPct <= 50 &&
    proponentMeiCapPct >= proponentCapPct &&
    proponentMeiCapPct <= 50 &&
    supplierCapPct > 0 &&
    supplierCapPct <= 50;

  if (!plausible) notes.push("Percentuais fora da faixa esperada (1–50%)");

  const confidence: "high" | "low" = foundAll && plausible ? "high" : "low";

  return {
    caps: {
      proponentCapPct,
      proponentMeiCapPct,
      supplierCapPct,
      nearCapPct: Math.max(1, Math.min(proponentCapPct - 2, DEFAULT_CAPS.nearCapPct)),
      articles: {
        proponent: "art. 23",
        supplier: "art. 24",
        supplierExceptions: "art. 24",
      },
      relationRules: DEFAULT_CAPS.relationRules,
    },
    confidence,
    notes,
    sourceCode,
    versionHint,
  };
}

export function capsEqual(a: ComplianceCaps, b: ComplianceCaps) {
  return (
    a.proponentCapPct === b.proponentCapPct &&
    a.proponentMeiCapPct === b.proponentMeiCapPct &&
    a.supplierCapPct === b.supplierCapPct &&
    a.nearCapPct === b.nearCapPct &&
    a.articles.proponent === b.articles.proponent &&
    a.articles.supplier === b.articles.supplier
  );
}
