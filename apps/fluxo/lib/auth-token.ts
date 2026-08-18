export const AUTH_COOKIE = "sigacultural_session";
export const PENDING_2FA_COOKIE = "sigacultural_pending_2fa";
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const PENDING_2FA_MAX_AGE = 60 * 10;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return secret;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toHex(signature);
}

export type SessionPayload = {
  userId: string;
  sessionVersion: number;
  issuedAt: number;
};

export type Pending2faPayload = {
  userId: string;
  issuedAt: number;
};

export async function createSessionToken(input: {
  userId: string;
  sessionVersion: number;
}): Promise<string> {
  const issuedAt = Date.now();
  const payload = `u:${input.userId}:${input.sessionVersion}:${issuedAt}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function parseSessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = await sign(payload);
  if (!timingSafeEqualString(signature, expected)) return null;

  const parts = payload.split(":");
  if (parts[0] !== "u" || parts.length !== 4) return null;
  const userId = parts[1]!;
  const sessionVersion = Number(parts[2]);
  const issuedAt = Number(parts[3]);
  if (!userId || !Number.isFinite(sessionVersion) || !Number.isFinite(issuedAt)) {
    return null;
  }
  const ageMs = Date.now() - issuedAt;
  if (ageMs < 0 || ageMs > MAX_AGE_SECONDS * 1000) return null;
  return { userId, sessionVersion, issuedAt };
}

/** @deprecated use parseSessionToken — kept for middleware boolean checks */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  return (await parseSessionToken(token)) !== null;
}

export async function createPending2faToken(userId: string): Promise<string> {
  const issuedAt = Date.now();
  const payload = `p2fa:${userId}:${issuedAt}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function parsePending2faToken(
  token: string | undefined | null,
): Promise<Pending2faPayload | null> {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = await sign(payload);
  if (!timingSafeEqualString(signature, expected)) return null;
  const parts = payload.split(":");
  if (parts[0] !== "p2fa" || parts.length !== 3) return null;
  const userId = parts[1]!;
  const issuedAt = Number(parts[2]);
  if (!userId || !Number.isFinite(issuedAt)) return null;
  const ageMs = Date.now() - issuedAt;
  if (ageMs < 0 || ageMs > PENDING_2FA_MAX_AGE * 1000) return null;
  return { userId, issuedAt };
}
