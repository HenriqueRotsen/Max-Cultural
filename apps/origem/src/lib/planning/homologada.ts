/**
 * Planilha homologada canônica (SALIC SpRenderizarPlanilhas tipo AP).
 * Mesma estrutura para federal (endpoint) e estadual (arquivo).
 */

export type HomologatedItemRaw = {
  Seq?: number | string;
  Item?: string;
  Unidade?: string;
  QtdeDias?: number | string;
  Quantidade?: number | string;
  Ocorrencia?: number | string;
  vlUnitario?: number | string;
  vlSolicitado?: number | string;
  vlSugerido?: number | string;
  vlAprovado?: number | string;
  VlComprovado?: number | string;
  idPlanilhaAprovacao?: number | string;
  idPlanilhaItens?: number | string;
  FonteRecurso?: string;
  Produto?: string;
  Etapa?: string;
  UF?: string;
  Municipio?: string;
  tpAcao?: string;
  [key: string]: unknown;
};

export type HomologatedLine = {
  planilhaAprovacaoId: string | null;
  fonteRecurso: string;
  productName: string;
  stageName: string;
  state: string;
  city: string;
  itemName: string;
  categoryHint: string | null;
  unit: string;
  days: number;
  quantity: number;
  occurrences: number;
  unitPrice: number;
  approvedAmount: number;
  salicComprovado: number | null;
  sortOrder: number;
};

function num(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  return String(v).trim() || fallback;
}

/** Heurística simples item → categoria do catálogo. */
export function inferCategoryHint(itemName: string): string | null {
  const t = itemName.toLowerCase();
  if (/ti\b|tecnolog|software|sistema|informátic|informatic/.test(t)) return "ti_tecnologia";
  if (/transporte|frete|logístic|logistic|passagem/.test(t)) return "logistica_transporte";
  if (/limpeza|conservação|conservacao|facilities/.test(t)) return "facilities_limpeza";
  if (/manuten/.test(t)) return "manutencao";
  if (/jurídic|juridic|advogad/.test(t)) return "juridico";
  if (/contábil|contabil|financeiro/.test(t)) return "contabil_financeiro";
  if (/marketing|comunicação|comunicacao|publicidade|divulg/.test(t)) {
    return "marketing_comunicacao";
  }
  if (/segurança|seguranca|vigilân/.test(t)) return "seguranca";
  if (/aliment|buffet|coffee|catering/.test(t)) return "alimentacao_eventos";
  if (/construção|construcao|reforma|obra/.test(t)) return "construcao_reforma";
  if (/consultor|engenhar/.test(t)) return "engenharia_consultoria";
  if (/rh\b|recrut|pessoal/.test(t)) return "rh_recrutamento";
  if (/energia|elétrica|eletrica/.test(t)) return "energia";
  return "outros";
}

/**
 * Achata a árvore `{ Fonte: { Produto: { Etapa: { "UF - Cidade": { itens, total } } } } }`
 * ou um array plano de itens do SP.
 */
export function flattenHomologatedPlanilha(data: unknown): {
  lines: HomologatedLine[];
  totalApproved: number;
} {
  if (!data || typeof data !== "object") {
    return { lines: [], totalApproved: 0 };
  }

  const root = data as Record<string, unknown>;
  const lines: HomologatedLine[] = [];
  let sortOrder = 0;

  const pushItem = (
    item: HomologatedItemRaw,
    ctx: {
      fonte: string;
      produto: string;
      etapa: string;
      state: string;
      city: string;
    },
  ) => {
    if (item.tpAcao === "E") return;
    const itemName = str(item.Item, "Item");
    const approved = num(item.vlAprovado);
    lines.push({
      planilhaAprovacaoId:
        item.idPlanilhaAprovacao != null ? String(item.idPlanilhaAprovacao) : null,
      fonteRecurso: ctx.fonte || str(item.FonteRecurso, "Incentivo Fiscal Federal"),
      productName: ctx.produto || str(item.Produto, "Administração do Projeto"),
      stageName: ctx.etapa || str(item.Etapa, "Etapa"),
      state: ctx.state || str(item.UF),
      city: ctx.city || str(item.Municipio),
      itemName,
      categoryHint: inferCategoryHint(itemName),
      unit: str(item.Unidade, "Unidade"),
      days: Math.max(1, Math.round(num(item.QtdeDias, 1))),
      quantity: num(item.Quantidade, 1),
      occurrences: num(item.Ocorrencia, 1),
      unitPrice: num(item.vlUnitario),
      approvedAmount: approved,
      salicComprovado:
        item.VlComprovado != null && item.VlComprovado !== ""
          ? num(item.VlComprovado)
          : null,
      sortOrder: sortOrder++,
    });
  };

  const walk = (
    node: unknown,
    depth: number,
    ctx: { fonte: string; produto: string; etapa: string; state: string; city: string },
  ) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;

    if (Array.isArray(obj.itens)) {
      for (const raw of obj.itens) {
        if (raw && typeof raw === "object") {
          pushItem(raw as HomologatedItemRaw, ctx);
        }
      }
      return;
    }

    for (const [key, child] of Object.entries(obj)) {
      if (key === "total" || key === "vlSolicitadoTotal" || key === "vlSugeridoTotal") {
        continue;
      }
      if (key === "vlAprovadoTotal" || key === "vlComprovadoTotal") continue;
      if (!child || typeof child !== "object") continue;

      if (depth === 0) {
        walk(child, 1, { ...ctx, fonte: key });
      } else if (depth === 1) {
        walk(child, 2, { ...ctx, produto: key });
      } else if (depth === 2) {
        walk(child, 3, { ...ctx, etapa: key });
      } else if (depth === 3) {
        const parts = key.split(" - ");
        const state = parts[0]?.trim() || "";
        const city = parts.slice(1).join(" - ").trim();
        walk(child, 4, { ...ctx, state, city });
      } else {
        walk(child, depth + 1, ctx);
      }
    }
  };

  // Array plano (fallback)
  if (Array.isArray(data)) {
    for (const raw of data) {
      if (raw && typeof raw === "object") {
        pushItem(raw as HomologatedItemRaw, {
          fonte: "",
          produto: "",
          etapa: "",
          state: "",
          city: "",
        });
      }
    }
  } else {
    const rest = { ...root };
    delete rest.total;
    walk(rest, 0, { fonte: "", produto: "", etapa: "", state: "", city: "" });
  }

  const totalFromRoot = num(root.total);
  const totalApproved =
    totalFromRoot > 0
      ? totalFromRoot
      : lines.reduce((s, l) => s + l.approvedAmount, 0);

  return { lines, totalApproved };
}
