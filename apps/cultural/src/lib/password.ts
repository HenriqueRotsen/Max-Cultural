import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type PasswordStrengthResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateStrongPassword(
  password: string,
  opts?: { email?: string },
): PasswordStrengthResult {
  if (password.length < 10) {
    return { ok: false, error: "A senha deve ter pelo menos 10 caracteres." };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, error: "Inclua ao menos uma letra minúscula." };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, error: "Inclua ao menos uma letra maiúscula." };
  }
  if (!/\d/.test(password)) {
    return { ok: false, error: "Inclua ao menos um dígito." };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, error: "Inclua ao menos um símbolo." };
  }
  const email = opts?.email?.trim().toLowerCase();
  if (email && password.toLowerCase().includes(email.split("@")[0] ?? "")) {
    return { ok: false, error: "A senha não pode conter o e-mail." };
  }
  return { ok: true };
}

export function generateProvisionalPassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  if (!/[a-z]/.test(out)) out = `a${out.slice(1)}`;
  if (!/[A-Z]/.test(out)) out = `A${out.slice(1)}`;
  if (!/\d/.test(out)) out = `2${out.slice(1)}`;
  if (!/[^A-Za-z0-9]/.test(out)) out = `!${out.slice(1)}`;
  return out;
}

export async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
