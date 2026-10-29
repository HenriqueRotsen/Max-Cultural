export type PasswordCheck = {
  ok: boolean;
  errors: string[];
};

/** Senha forte: mínimo 10, maiúscula, minúscula, número e símbolo. */
export function validateStrongPassword(password: string): PasswordCheck {
  const errors: string[] = [];
  if (password.length < 10) errors.push("Use pelo menos 10 caracteres");
  if (!/[a-z]/.test(password)) errors.push("Inclua ao menos uma letra minúscula");
  if (!/[A-Z]/.test(password)) errors.push("Inclua ao menos uma letra maiúscula");
  if (!/\d/.test(password)) errors.push("Inclua ao menos um número");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Inclua ao menos um símbolo (ex.: !@#$)");
  return { ok: errors.length === 0, errors };
}

export function generateTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]!;
  const base = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (base.length < 14) base.push(pick(all));
  return base.sort(() => Math.random() - 0.5).join("");
}
