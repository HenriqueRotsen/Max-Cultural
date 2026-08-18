/** Helpers de formatação seguros para client e server (sem Node crypto). */

export function normalizeCgccpf(value: string): string {
  return value.replace(/\D/g, "");
}

function allSameDigits(digits: string) {
  return /^(\d)\1+$/.test(digits);
}

function mod11CheckDigit(digits: string, weights: number[]) {
  const sum = weights.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Valida CPF pelos dígitos verificadores (rejeita sequências tipo 111.111.111-11). */
export function isValidCpf(value: string | null | undefined): boolean {
  const digits = normalizeCgccpf(value || "");
  if (digits.length !== 11 || allSameDigits(digits)) return false;
  const d1 = mod11CheckDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(digits[9])) return false;
  const d2 = mod11CheckDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(digits[10]);
}

/** Valida CNPJ pelos dígitos verificadores. */
export function isValidCnpj(value: string | null | undefined): boolean {
  const digits = normalizeCgccpf(value || "");
  if (digits.length !== 14 || allSameDigits(digits)) return false;
  const d1 = mod11CheckDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(digits[12])) return false;
  const d2 = mod11CheckDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(digits[13]);
}

/** Aceita CPF (11) ou CNPJ (14) válidos. */
export function isValidCgccpf(value: string | null | undefined): boolean {
  const digits = normalizeCgccpf(value || "");
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

export function cgccpfValidationError(value: string | null | undefined): string | null {
  const digits = normalizeCgccpf(value || "");
  if (!digits) return "Informe um CPF ou CNPJ";
  if (digits.length === 11) {
    return isValidCpf(digits) ? null : "CPF inválido";
  }
  if (digits.length === 14) {
    return isValidCnpj(digits) ? null : "CNPJ inválido";
  }
  if (digits.length < 11) return "CPF incompleto";
  if (digits.length < 14) return "CNPJ incompleto";
  return "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)";
}

/** CPF `000.000.000-00` ou CNPJ `00.000.000/0000-00`. */
export function formatCgccpf(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  let digits = normalizeCgccpf(value);
  // CNPJ com zero à esquerda perdido em algum ponto do fluxo
  if (digits.length >= 12 && digits.length < 14) {
    digits = digits.padStart(14, "0");
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return value.trim() || "—";
}

export function formatCurrency(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n || 0);
}

/** Percentual pt-BR com casas fixas (padrão 4 — ex.: 10,8746%). */
export function formatPercentValue(value: number, digits = 4): string {
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

/** Parte / total → percentual formatado. */
export function formatPercentOf(part: number, total: number, digits = 4): string {
  if (!total || total <= 0) return formatPercentValue(0, digits);
  return formatPercentValue((part / total) * 100, digits);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(d);
}
