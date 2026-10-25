import * as XLSX from "@e965/xlsx";

export type SheetProjectRow = {
  item: number | null;
  proponente: string;
  pronac: string;
  projeto: string;
  situacao: string | null;
  inLabel: string | null;
  /** Chave normalizada p/ cruzar com sourceCode do Salink (ex.: "2/2019"). */
  inKey: string | null;
  dtRevogacaoIn: string | null;
  dtInicio: string | null;
  dataFim: string | null;
  captado: number | null;
  limite: number | null;
  cenario1: string | null;
  cenario2: string | null;
  cenario3: string | null;
};

export type SystemProjectRow = {
  id: string;
  pronac: string;
  name: string | null;
  accountName: string;
  valorCaptado: number | null;
  sourceCode: string | null;
  inKey: string | null;
  supplierCapPct: number | null;
  proponentCapPct: number | null;
  paidTotal: number;
};

export type FieldDiff = {
  field: string;
  label: string;
  sheet: string;
  system: string;
  status: "match" | "diff" | "sheet_only" | "system_only" | "skip";
};

export type CompareRow = {
  pronac: string;
  status: "ok" | "diff" | "missing_in_system" | "missing_in_sheet";
  sheet: SheetProjectRow | null;
  system: SystemProjectRow | null;
  fields: FieldDiff[];
};

export type CompareSummary = {
  sheetCount: number;
  systemCount: number;
  ok: number;
  diff: number;
  missingInSystem: number;
  missingInSheet: number;
};

export type CompareResult = {
  summary: CompareSummary;
  rows: CompareRow[];
  mapping: Array<{ sheet: string; system: string }>;
};

const HEADER_ALIASES: Record<string, keyof SheetProjectRow | "ignore"> = {
  item: "item",
  proponente: "proponente",
  pronac: "pronac",
  projeto: "projeto",
  situacao: "situacao",
  "situação": "situacao",
  in: "inLabel",
  "instrução normativa": "inLabel",
  "instrucao normativa": "inLabel",
  "dt. revogação in": "dtRevogacaoIn",
  "dt revogação in": "dtRevogacaoIn",
  "dt. revogacao in": "dtRevogacaoIn",
  "dt. inicio": "dtInicio",
  "dt. início": "dtInicio",
  "dt inicio": "dtInicio",
  "data fim": "dataFim",
  captado: "captado",
  limite: "limite",
  "cenario 1": "cenario1",
  "cenário 1": "cenario1",
  "cenario 2": "cenario2",
  "cenário 2": "cenario2",
  "cenario 3": "cenario3",
  "cenário 3": "cenario3",
};

function normHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellText(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).replace(/\u0096/g, "–").trim();
  return s || null;
}

function cellNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  // BR: 1.234.567,89
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw) || /^\d+,\d+$/.test(raw)) {
    const n = Number(raw.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Extrai chave IN: "2/2019", "1/2023", "01/2013" → sem zeros à esquerda no número. */
export function normalizeInKey(label: string | null | undefined): string | null {
  if (!label) return null;
  const s = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = s.match(/n[ºo°.]?\s*0*(\d+)\s*\/\s*(\d{4})/i);
  if (m) return `${Number(m[1])}/${m[2]}`;
  const m2 = s.match(/0*(\d+)\s*\/\s*(\d{4})/);
  if (m2) return `${Number(m2[1])}/${m2[2]}`;
  return null;
}

export function normalizePronac(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function namesLooselyEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function moneyEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.015;
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${String(n).replace(".", ",")}%`;
}

function excelSerialToDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const mm = String(parsed.m).padStart(2, "0");
    const dd = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${mm}-${dd}`;
  }
  return cellText(value);
}

/** Lê a aba "Listar Projetos" (ou a primeira com coluna Pronac). */
export function parseProjectsWorkbook(buffer: ArrayBuffer | Buffer): SheetProjectRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const preferred =
    wb.SheetNames.find((n) => /listar\s*projetos/i.test(n)) ||
    wb.SheetNames.find((n) => {
      const sheet = wb.Sheets[n];
      const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
        header: 1,
        defval: null,
      });
      const header = (rows[0] || []).map(normHeader);
      return header.includes("pronac");
    }) ||
    wb.SheetNames[0];

  const sheet = wb.Sheets[preferred];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  if (matrix.length < 2) return [];

  const headerRow = matrix[0].map(normHeader);
  const colIndex: Partial<Record<keyof SheetProjectRow, number>> = {};
  headerRow.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key && key !== "ignore") colIndex[key] = i;
  });

  if (colIndex.pronac == null) {
    throw new Error(
      'Planilha sem coluna "Pronac". Use a aba "Listar Projetos" com as colunas esperadas.',
    );
  }

  const out: SheetProjectRow[] = [];
  for (const row of matrix.slice(1)) {
    const pronac = normalizePronac(row[colIndex.pronac!]);
    if (!pronac) continue;
    const inLabel = cellText(row[colIndex.inLabel ?? -1]);
    out.push({
      item: cellNumber(row[colIndex.item ?? -1]),
      proponente: cellText(row[colIndex.proponente ?? -1]) || "",
      pronac,
      projeto: cellText(row[colIndex.projeto ?? -1]) || "",
      situacao: cellText(row[colIndex.situacao ?? -1]),
      inLabel,
      inKey: normalizeInKey(inLabel),
      dtRevogacaoIn: excelSerialToDate(row[colIndex.dtRevogacaoIn ?? -1]),
      dtInicio: excelSerialToDate(row[colIndex.dtInicio ?? -1]),
      dataFim: excelSerialToDate(row[colIndex.dataFim ?? -1]),
      captado: cellNumber(row[colIndex.captado ?? -1]),
      limite: cellNumber(row[colIndex.limite ?? -1]),
      cenario1: cellText(row[colIndex.cenario1 ?? -1]),
      cenario2: cellText(row[colIndex.cenario2 ?? -1]),
      cenario3: cellText(row[colIndex.cenario3 ?? -1]),
    });
  }
  return out;
}

function field(
  label: string,
  fieldKey: string,
  sheet: string,
  system: string,
  status: FieldDiff["status"],
): FieldDiff {
  return { field: fieldKey, label, sheet, system, status };
}

function comparePair(sheet: SheetProjectRow, system: SystemProjectRow): FieldDiff[] {
  const fields: FieldDiff[] = [];

  const nameOk = namesLooselyEqual(sheet.projeto, system.name);
  fields.push(
    field(
      "Projeto",
      "projeto",
      sheet.projeto || "—",
      system.name || "—",
      !sheet.projeto && !system.name ? "skip" : nameOk ? "match" : "diff",
    ),
  );

  const propOk = namesLooselyEqual(sheet.proponente, system.accountName);
  fields.push(
    field(
      "Proponente",
      "proponente",
      sheet.proponente || "—",
      system.accountName || "—",
      !sheet.proponente && !system.accountName ? "skip" : propOk ? "match" : "diff",
    ),
  );

  const inOk =
    sheet.inKey != null && system.inKey != null
      ? sheet.inKey === system.inKey
      : sheet.inLabel == null && system.sourceCode == null;
  fields.push(
    field(
      "IN",
      "in",
      sheet.inLabel || "—",
      system.sourceCode || "—",
      sheet.inLabel == null && system.sourceCode == null
        ? "skip"
        : sheet.inKey == null || system.inKey == null
          ? sheet.inLabel && system.sourceCode
            ? "diff"
            : sheet.inLabel
              ? "sheet_only"
              : "system_only"
          : inOk
            ? "match"
            : "diff",
    ),
  );

  const capOk = moneyEqual(sheet.captado, system.valorCaptado);
  fields.push(
    field(
      "Captado",
      "captado",
      formatMoney(sheet.captado),
      formatMoney(system.valorCaptado),
      sheet.captado == null && system.valorCaptado == null
        ? "skip"
        : sheet.captado == null
          ? "system_only"
          : system.valorCaptado == null
            ? "sheet_only"
            : capOk
              ? "match"
              : "diff",
    ),
  );

  const limiteMatchesSystem =
    sheet.limite != null &&
    (sheet.limite === system.supplierCapPct || sheet.limite === system.proponentCapPct);
  const systemLimiteLabel =
    system.supplierCapPct != null || system.proponentCapPct != null
      ? `forn. ${formatPct(system.supplierCapPct)} · prop. ${formatPct(system.proponentCapPct)}`
      : "—";
  fields.push(
    field(
      "Limite",
      "limite",
      formatPct(sheet.limite),
      systemLimiteLabel,
      sheet.limite == null
        ? system.supplierCapPct == null
          ? "skip"
          : "system_only"
        : system.supplierCapPct == null && system.proponentCapPct == null
          ? "sheet_only"
          : limiteMatchesSystem
            ? "match"
            : "diff",
    ),
  );

  // Informativos só da planilha (não existem no modelo Project)
  if (sheet.situacao) {
    fields.push(field("Situação", "situacao", sheet.situacao, "—", "sheet_only"));
  }
  if (sheet.dtInicio) {
    fields.push(field("Dt. início", "dtInicio", sheet.dtInicio, "—", "sheet_only"));
  }
  if (sheet.dataFim) {
    fields.push(field("Data fim", "dataFim", sheet.dataFim, "—", "sheet_only"));
  }

  return fields;
}

export function compareSheetToSystem(
  sheetRows: SheetProjectRow[],
  systemRows: SystemProjectRow[],
): CompareResult {
  const byPronacSheet = new Map<string, SheetProjectRow>();
  for (const row of sheetRows) {
    // Se houver duplicata na planilha, mantém a última
    byPronacSheet.set(row.pronac, row);
  }
  const byPronacSystem = new Map<string, SystemProjectRow>();
  for (const row of systemRows) {
    // Mesmo PRONAC em contas diferentes: prioriza o que tem captado / IN
    const prev = byPronacSystem.get(row.pronac);
    if (!prev) {
      byPronacSystem.set(row.pronac, row);
      continue;
    }
    const score = (r: SystemProjectRow) =>
      (r.valorCaptado != null ? 2 : 0) + (r.sourceCode ? 1 : 0) + (r.paidTotal > 0 ? 1 : 0);
    if (score(row) >= score(prev)) byPronacSystem.set(row.pronac, row);
  }

  const allPronacs = new Set([...byPronacSheet.keys(), ...byPronacSystem.keys()]);
  const rows: CompareRow[] = [];

  for (const pronac of [...allPronacs].sort((a, b) => a.localeCompare(b, "pt-BR"))) {
    const sheet = byPronacSheet.get(pronac) || null;
    const system = byPronacSystem.get(pronac) || null;

    if (sheet && !system) {
      rows.push({
        pronac,
        status: "missing_in_system",
        sheet,
        system: null,
        fields: [
          field("Projeto", "projeto", sheet.projeto || "—", "—", "sheet_only"),
          field("Proponente", "proponente", sheet.proponente || "—", "—", "sheet_only"),
          field("IN", "in", sheet.inLabel || "—", "—", "sheet_only"),
          field("Captado", "captado", formatMoney(sheet.captado), "—", "sheet_only"),
          field("Limite", "limite", formatPct(sheet.limite), "—", "sheet_only"),
        ],
      });
      continue;
    }

    if (!sheet && system) {
      rows.push({
        pronac,
        status: "missing_in_sheet",
        sheet: null,
        system,
        fields: [
          field("Projeto", "projeto", "—", system.name || "—", "system_only"),
          field("Proponente", "proponente", "—", system.accountName || "—", "system_only"),
          field("IN", "in", "—", system.sourceCode || "—", "system_only"),
          field("Captado", "captado", "—", formatMoney(system.valorCaptado), "system_only"),
        ],
      });
      continue;
    }

    if (sheet && system) {
      const fields = comparePair(sheet, system);
      const hasDiff = fields.some((f) => f.status === "diff");
      rows.push({
        pronac,
        status: hasDiff ? "diff" : "ok",
        sheet,
        system,
        fields,
      });
    }
  }

  const summary: CompareSummary = {
    sheetCount: byPronacSheet.size,
    systemCount: byPronacSystem.size,
    ok: rows.filter((r) => r.status === "ok").length,
    diff: rows.filter((r) => r.status === "diff").length,
    missingInSystem: rows.filter((r) => r.status === "missing_in_system").length,
    missingInSheet: rows.filter((r) => r.status === "missing_in_sheet").length,
  };

  return {
    summary,
    rows,
    mapping: [
      { sheet: "Pronac", system: "Project.pronac (chave)" },
      { sheet: "Proponente", system: "SalicAccount.name" },
      { sheet: "Projeto", system: "Project.name" },
      { sheet: "IN", system: "ComplianceRuleset.sourceCode" },
      { sheet: "Captado", system: "Project.valorCaptado" },
      { sheet: "Limite", system: "caps.supplierCapPct / proponentCapPct da IN" },
      { sheet: "Situação / datas", system: "(não armazenado — só informativo)" },
    ],
  };
}
