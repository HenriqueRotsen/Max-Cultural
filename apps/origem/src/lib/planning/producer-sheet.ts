import * as XLSX from "@e965/xlsx";
import { parseBrMoney } from "@/lib/format";
import {
  recommendRubric,
  type RubricCandidate,
} from "@/lib/planning/recommend-rubric";

export type ProducerSheetRow = {
  rowIndex: number;
  item: string;
  amount: number;
  supplier: string;
  cnpj: string;
  notes: string;
  suggestedLineId: string | null;
  suggestionReasons: string[];
  suggestionScore: number;
};

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

function parseAmount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return parseBrMoney(String(raw ?? "")) || 0;
}

export function parseProducerSheet(
  buffer: Buffer,
  filename: string,
  candidates: RubricCandidate[],
): ProducerSheetRow[] {
  const lower = filename.toLowerCase();
  let rows: Record<string, unknown>[];

  if (lower.endsWith(".csv")) {
    const text = buffer.toString("utf8");
    const wb = XLSX.read(text, { type: "string" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Arquivo vazio");
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheetName]!,
      { defval: "" },
    );
  } else {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Arquivo sem planilhas");
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheetName]!,
      { defval: "" },
    );
  }

  if (rows.length === 0) throw new Error("Planilha vazia");

  const out: ProducerSheetRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const item = String(
      cell(row, ["item", "Item", "descricao", "Descrição", "Descrição do item"]) ||
        "",
    ).trim();
    const amount = parseAmount(
      cell(row, ["valor", "Valor", "amount", "preco", "Preço"]),
    );
    const supplier = String(
      cell(row, ["fornecedor", "Fornecedor", "supplier", "nome"]) || "",
    ).trim();
    const cnpj = String(
      cell(row, ["cnpj", "CNPJ", "cpf", "CPF", "documento"]) || "",
    ).trim();
    const notes = String(
      cell(row, ["observacao", "Observação", "obs", "notas", "Notas"]) || "",
    ).trim();

    if (!item && !supplier && amount <= 0) continue;

    const query = [item, notes, supplier].filter(Boolean).join(" · ");
    const suggestion = recommendRubric({
      lines: candidates,
      serviceText: query,
      grossAmount: amount > 0 ? amount : null,
    });

    out.push({
      rowIndex: i + 1,
      item: item || supplier || `Linha ${i + 1}`,
      amount,
      supplier,
      cnpj,
      notes,
      suggestedLineId: suggestion?.lineId ?? null,
      suggestionReasons: suggestion?.reasons ?? [],
      suggestionScore: suggestion?.score ?? 0,
    });
  }

  if (out.length === 0) {
    throw new Error("Nenhuma linha válida encontrada (item/valor/fornecedor).");
  }
  return out;
}

/** Gera template xlsx com rubricas do projeto. */
export function buildProducerSheetTemplate(
  rubrics: Array<{ itemName: string; stageName: string; productName: string }>,
): Buffer {
  const example = [
    {
      Item: "Locação de equipamento de som",
      Valor: 1500,
      Fornecedor: "Empresa Exemplo Ltda",
      CNPJ: "00.000.000/0001-00",
      Observação: "Show de abertura",
    },
  ];
  const rubricRef = rubrics.map((r) => ({
    Produto: r.productName,
    Etapa: r.stageName,
    Item: r.itemName,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(example), "Lançamentos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rubricRef), "Rubricas");
  return Buffer.from(
    XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer,
  );
}
