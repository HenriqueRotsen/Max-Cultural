import { moneyN } from "@/lib/planning/readequacao";

export type CompareLineInput = {
  planilhaAprovacaoId?: string | null;
  fonteRecurso: string;
  productName: string;
  stageName: string;
  state: string;
  city: string;
  itemName: string;
  amount: unknown;
};

export type SheetCompareRow = {
  key: string;
  productName: string;
  stageName: string;
  itemName: string;
  local: string;
  before: number | null;
  after: number | null;
  diff: number;
  status: "IGUAL" | "ALTERADA" | "NOVA" | "REMOVIDA";
};

function semanticKey(l: CompareLineInput) {
  return [l.fonteRecurso, l.productName, l.stageName, l.state, l.city, l.itemName]
    .map((v) => String(v || "").trim().toLowerCase())
    .join("|");
}

/**
 * Compara a planilha anterior (homologada) com a atual, rubrica a rubrica.
 * Casa pelo id da planilha no SALIC e, se a readequação trocou os ids, pelo
 * produto/etapa/local/item.
 */
export function compareSheets(before: CompareLineInput[], after: CompareLineInput[]): SheetCompareRow[] {
  const byId = new Map<string, number>();
  const bySemantic = new Map<string, number[]>();
  before.forEach((l, i) => {
    const id = String(l.planilhaAprovacaoId || "").trim();
    if (id) byId.set(id, i);
    const k = semanticKey(l);
    bySemantic.set(k, [...(bySemantic.get(k) || []), i]);
  });
  const used = new Set<number>();
  const rows: SheetCompareRow[] = [];
  const round = (n: number) => Math.round(n * 100) / 100;

  const row = (l: CompareLineInput, b: number | null, a: number | null, key: string): SheetCompareRow => {
    const diff = round((a ?? 0) - (b ?? 0));
    return {
      key,
      productName: l.productName,
      stageName: l.stageName,
      itemName: l.itemName,
      local: [l.city, l.state].filter(Boolean).join("/"),
      before: b,
      after: a,
      diff,
      status: b == null ? "NOVA" : a == null ? "REMOVIDA" : Math.abs(diff) < 0.01 ? "IGUAL" : "ALTERADA",
    };
  };

  after.forEach((l, i) => {
    const id = String(l.planilhaAprovacaoId || "").trim();
    let match = id && byId.has(id) && !used.has(byId.get(id)!) ? byId.get(id)! : undefined;
    if (match === undefined) {
      match = (bySemantic.get(semanticKey(l)) || []).find((j) => !used.has(j));
    }
    if (match !== undefined) used.add(match);
    rows.push(
      row(l, match !== undefined ? round(moneyN(before[match]!.amount)) : null, round(moneyN(l.amount)), `a${i}`),
    );
  });
  before.forEach((l, i) => {
    if (!used.has(i)) rows.push(row(l, round(moneyN(l.amount)), null, `b${i}`));
  });
  return rows;
}
