/** Normaliza CNAE para só dígitos (7). */
export function normalizeCnaeCode(raw: string | number | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(0, 7);
}

/** Formata 6422100 → 6422-1/00 */
export function formatCnaeCode(raw: string | number | null | undefined): string {
  const digits = normalizeCnaeCode(raw);
  if (!digits) return "—";
  if (digits.length >= 7) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5, 7)}`;
  }
  return digits;
}

export function formatCnaeLabel(
  code: string | null | undefined,
  description?: string | null,
): string {
  const formatted = formatCnaeCode(code);
  if (formatted === "—") return description?.trim() || "—";
  if (description?.trim()) return `${formatted} — ${description.trim()}`;
  return formatted;
}
