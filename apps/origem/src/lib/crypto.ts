import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import {
  formatCgccpf,
  formatCurrency,
  formatDate,
  normalizeCgccpf,
} from "@/lib/format";

export {
  formatCgccpf,
  formatCurrency,
  formatDate,
  normalizeCgccpf,
};

const ALGO = "aes-256-gcm";

function getKey() {
  const secret = process.env.CREDENTIALS_SECRET;
  if (!secret) {
    throw new Error("CREDENTIALS_SECRET is not set");
  }
  return scryptSync(secret, "salink-salt", 32);
}

/** Payload AES-256-GCM no formato iv:tag:ciphertext (base64). */
export function looksEncrypted(payload: string): boolean {
  const parts = payload.split(":");
  if (parts.length !== 3) return false;
  const [ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) return false;
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    return iv.length === 12 && tag.length === 16 && data.length > 0;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Descriptografa credencial. Aceita valor legado em texto puro
 * (usuários salvos antes da criptografia do login).
 */
export function decryptCredential(payload: string | null | undefined): string | null {
  if (!payload) return null;
  if (!looksEncrypted(payload)) return payload;
  try {
    return decryptSecret(payload);
  } catch {
    // CREDENTIALS_SECRET diferente do que cifrou o valor — não derruba a página.
    return null;
  }
}

/** Criptografa login/senha para armazenamento em repouso. */
export function encryptCredential(plain: string | null | undefined): string | null {
  const value = plain?.trim();
  if (!value) return null;
  return encryptSecret(value);
}
