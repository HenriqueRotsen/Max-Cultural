import * as XLSX from "@e965/xlsx";
import {
  flattenHomologatedPlanilha,
  type HomologatedItemRaw,
  type HomologatedLine,
} from "@/lib/planning/homologada";

function cell(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return row[k];
  }
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]),
  );
  for (const k of keys) {
    const hit = lower[k.toLowerCase()];
    if (hit != null && String(hit).trim() !== "") return hit;
  }
  return undefined;
}

/**
 * Parser genérico de planilha homologada estadual (xlsx/csv).
 * Aceita colunas alinhadas ao SALIC (Fonte, Produto, Etapa, UF, Município, Item, …).
 */
export function parseStateHomologatedFile(
  buffer: Buffer,
  filename: string,
): { lines: HomologatedLine[]; totalApproved: number } {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) {
    const data = JSON.parse(buffer.toString("utf8")) as unknown;
    return flattenHomologatedPlanilha(data);
  }

  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("Arquivo sem planilhas");
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[sheetName]!,
    { defval: "" },
  );
  if (rows.length === 0) {
    throw new Error("Planilha vazia");
  }

  const items: HomologatedItemRaw[] = rows.map((row, i) => {
    const uf = String(cell(row, ["UF", "Uf", "Estado", "state"]) || "");
    const city = String(
      cell(row, ["Municipio", "Município", "Cidade", "city"]) || "",
    );
    return {
      Seq: i + 1,
      FonteRecurso: String(
        cell(row, ["FonteRecurso", "Fonte", "Fonte de Recurso"]) ||
          "Incentivo Fiscal Estadual",
      ),
      Produto: String(cell(row, ["Produto", "product"]) || "Produto"),
      Etapa: String(cell(row, ["Etapa", "stage"]) || "Etapa"),
      UF: uf,
      Municipio: city,
      Item: String(cell(row, ["Item", "Descrição", "Descricao", "itemName"]) || ""),
      Unidade: String(cell(row, ["Unidade", "unit"]) || "Unidade"),
      QtdeDias: (cell(row, ["QtdeDias", "Dias", "days"]) as number | string | undefined) ?? 1,
      Quantidade: (cell(row, ["Quantidade", "Qtde", "quantity"]) as number | string | undefined) ?? 1,
      Ocorrencia:
        (cell(row, ["Ocorrencia", "Ocorrência", "Ocor.", "occurrences"]) as
          | number
          | string
          | undefined) ?? 1,
      vlUnitario: cell(row, ["vlUnitario", "Vl. Unitário", "Valor Unitário", "unitPrice"]) as
        | number
        | string
        | undefined,
      vlAprovado: cell(row, [
        "vlAprovado",
        "Vl. Aprovado",
        "Valor Aprovado",
        "approvedAmount",
        "Valor",
      ]) as number | string | undefined,
      VlComprovado: cell(row, ["VlComprovado", "Vl. Comprovado"]) as
        | number
        | string
        | undefined,
      idPlanilhaAprovacao: cell(row, [
        "idPlanilhaAprovacao",
        "IdPlanilhaAprovacao",
        "id",
      ]) as number | string | undefined,
    };
  });

  const withItem = items.filter((it) => String(it.Item || "").trim());
  if (withItem.length === 0) {
    throw new Error(
      "Nenhuma linha válida. Use colunas: Fonte, Produto, Etapa, UF, Município, Item, Vl. Aprovado",
    );
  }

  // Monta árvore mínima para reutilizar flatten
  const tree: Record<string, unknown> = {};
  for (const it of withItem) {
    const fonte = String(it.FonteRecurso);
    const produto = String(it.Produto);
    const etapa = String(it.Etapa);
    const regiao = `${it.UF || ""} - ${it.Municipio || ""}`.trim();
    tree[fonte] ??= {};
    const f = tree[fonte] as Record<string, unknown>;
    f[produto] ??= {};
    const p = f[produto] as Record<string, unknown>;
    p[etapa] ??= {};
    const e = p[etapa] as Record<string, unknown>;
    e[regiao] ??= { itens: [] as HomologatedItemRaw[] };
    (e[regiao] as { itens: HomologatedItemRaw[] }).itens.push(it);
  }

  return flattenHomologatedPlanilha(tree);
}
