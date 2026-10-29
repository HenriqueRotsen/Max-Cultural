/**
 * Parâmetro numérico seguro para URLs de APIs externas (CNPJ, CEP, CNAE).
 * Remonta o valor a partir de um inteiro — só dígitos chegam ao path,
 * nunca "/", "..", "?" ou outro host vindo da entrada do usuário.
 */
export function digitsParam(raw: string, length: number): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== length) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n)) return null;
  return String(n).padStart(length, "0");
}
