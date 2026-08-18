import {
  formatCepDisplay,
  formatCpfDisplay,
  formatDateBR,
  formatPhoneDisplay,
  normalizeCep,
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  parseFlexibleDate,
} from "@/lib/normalize";
import type { SigaCulturalColumn, SigaCulturalRow } from "@/lib/schema";

export type FieldIssue = {
  column: SigaCulturalColumn;
  message: string;
};

export type RowIssue = {
  rowIndex: number;
  issues: FieldIssue[];
};

function isValidEmail(value: string): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLikelyCpf(value: string): boolean {
  if (!value) return true;
  const d = normalizeCpf(value);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  return true;
}

function isLikelyCep(value: string): boolean {
  if (!value) return true;
  return normalizeCep(value).length === 8;
}

function isLikelyPhone(value: string): boolean {
  if (!value) return true;
  const d = normalizePhone(value);
  return d.length === 10 || d.length === 11;
}

function isLikelyDate(value: string): boolean {
  if (!value) return true;
  return parseFlexibleDate(value) !== null;
}

function isSimNaoDetalhe(value: string): boolean {
  if (!value) return true;
  const v = value.trim();
  if (/^não$/i.test(v) || /^nao$/i.test(v)) return true;
  if (/^sim$/i.test(v)) return true;
  if (/^sim\s*,\s*.+/i.test(v)) return true;
  return false;
}

export function validateRowFields(row: SigaCulturalRow): FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (row.Nome.trim() && row.Nome.trim().length < 2) {
    issues.push({ column: "Nome", message: "Nome muito curto" });
  }
  if (row.CPF && !isLikelyCpf(row.CPF)) {
    issues.push({ column: "CPF", message: "CPF inválido (precisa de 11 dígitos)" });
  }
  if (row["E-mail"] && !isValidEmail(row["E-mail"])) {
    issues.push({ column: "E-mail", message: "E-mail inválido" });
  }
  if (row.Telefone && !isLikelyPhone(row.Telefone)) {
    issues.push({ column: "Telefone", message: "Telefone inválido" });
  }
  if (row.CEP && !isLikelyCep(row.CEP)) {
    issues.push({ column: "CEP", message: "CEP inválido (8 dígitos)" });
  }
  if (row.Data_nascimento && !isLikelyDate(row.Data_nascimento)) {
    issues.push({
      column: "Data_nascimento",
      message: "Data de nascimento inválida",
    });
  }
  if (row.Data_inscricao && !isLikelyDate(row.Data_inscricao)) {
    issues.push({
      column: "Data_inscricao",
      message: "Data de inscrição inválida",
    });
  }
  if (row.Estado && row.Estado.length > 0 && row.Estado.length !== 2) {
    issues.push({ column: "Estado", message: "UF deve ter 2 letras" });
  }
  if (row.Possui_deficiencia && !isSimNaoDetalhe(row.Possui_deficiencia)) {
    issues.push({
      column: "Possui_deficiencia",
      message: 'Use "Não", "Sim" ou "Sim, <detalhe>"',
    });
  }
  if (row.RestricaoAlimentar && !isSimNaoDetalhe(row.RestricaoAlimentar)) {
    issues.push({
      column: "RestricaoAlimentar",
      message: 'Use "Não", "Sim" ou "Sim, <detalhe>"',
    });
  }

  return issues;
}

export function validatePreviewRows(rows: SigaCulturalRow[]): RowIssue[] {
  const out: RowIssue[] = [];
  rows.forEach((row, rowIndex) => {
    const issues = validateRowFields(row);
    if (issues.length) out.push({ rowIndex, issues });
  });
  return out;
}

/** Valor formatado só para exibição (banco permanece sem máscara quando aplicável) */
export function formatCellDisplay(
  column: SigaCulturalColumn,
  value: unknown,
): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  switch (column) {
    case "CPF":
      return formatCpfDisplay(raw) || raw;
    case "CEP":
      return formatCepDisplay(raw) || raw;
    case "Telefone":
      return formatPhoneDisplay(raw) || raw;
    case "Data_nascimento":
    case "Data_inscricao": {
      const d = parseFlexibleDate(raw);
      return d ? formatDateBR(d) : raw;
    }
    default:
      return raw;
  }
}

/** Converte o que o usuário digitou (possivelmente mascarado) para valor de armazenamento */
export function parseCellInput(
  column: SigaCulturalColumn,
  value: string,
): string | number | null {
  if (
    column === "idade_atual" ||
    column === "idade_inscricao" ||
    column === "Inscritos" ||
    column === "Selecionados" ||
    column === "Participantes" ||
    column === "Certificado"
  ) {
    if (column === "idade_atual" || column === "idade_inscricao") {
      return value.trim() === "" ? null : Number(value);
    }
    return Number(value) || 0;
  }
  if (column === "CPF") return normalizeCpf(value);
  if (column === "CEP") return normalizeCep(value);
  if (column === "Telefone") return normalizePhone(value);
  if (column === "E-mail") return normalizeEmail(value);
  return value;
}
