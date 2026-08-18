import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { decryptSecret, encryptSecret } from "@/lib/crypto-secret";

const ISSUER = process.env.NEXT_PUBLIC_APP_NAME ?? "SigaCultural";

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export async function encryptTotpSecret(secret: string): Promise<string> {
  return encryptSecret(secret);
}

export async function decryptTotpSecret(enc: string): Promise<string> {
  return decryptSecret(enc);
}

function makeTotp(secret: string, label: string) {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

export function totpUri(secret: string, email: string): string {
  return makeTotp(secret, email).toString();
}

export async function totpQrDataUrl(
  secret: string,
  email: string,
): Promise<string> {
  return QRCode.toDataURL(totpUri(secret, email), { margin: 1, width: 220 });
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const totp = makeTotp(secret, "verify");
  const delta = totp.validate({ token: token.replace(/\s/g, ""), window: 1 });
  return delta !== null;
}

export function is2faDisabled(): boolean {
  return process.env.AUTH_2FA_DISABLED === "true";
}
