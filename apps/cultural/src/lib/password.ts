import bcrypt from "bcryptjs";
import { checkPasswordRules } from "@/lib/password-rules";

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
  const failed = checkPasswordRules(password, opts?.email).find((c) => !c.ok);
  if (failed) return { ok: false, error: failed.error };
  return { ok: true };
}

/** Índice uniforme em [0, n) — rejeição por máscara de bits, sem viés de módulo. */
function randomIndex(n: number): number {
  const mask = 2 ** Math.ceil(Math.log2(n)) - 1;
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0]! & mask;
    if (v < n) return v;
  }
}

export function generateProvisionalPassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
  const pick = (set: string) => set[randomIndex(set.length)]!;
  // Um de cada classe mínima; o resto do alfabeto todo.
  const chars = [
    pick("abcdefghijkmnopqrstuvwxyz"),
    pick("ABCDEFGHJKLMNPQRSTUVWXYZ"),
    pick("23456789"),
    pick("!@$%"),
  ];
  while (chars.length < length) chars.push(pick(alphabet));
  // Fisher–Yates para as classes garantidas não ficarem sempre no início.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
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

export function randomOtpCode(digits = 6): string {
  let out = "";
  for (let i = 0; i < digits; i++) out += String(randomIndex(10));
  return out;
}
