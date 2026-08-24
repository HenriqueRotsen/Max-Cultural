/** Sessão HMAC compartilhada entre Cultural, Origem e Fluxo. */

export const AUTH_COOKIE = "max_session";
export const PENDING_2FA_COOKIE = "max_pending_2fa";
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const PENDING_2FA_MAX_AGE = 60 * 10;

export function cookieDomain(): string | undefined {
  const domain = (process.env.AUTH_COOKIE_DOMAIN || "").trim();
  return domain || undefined;
}

export function sessionCookieOptions(maxAge: number) {
  const domain = cookieDomain();
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

export function cookieDeleteOptions() {
  const domain = cookieDomain();
  return {
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

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
  email?: string;
};

export type Pending2faPayload = {
  userId: string;
  issuedAt: number;
};

export async function createSessionToken(input: {
  userId: string;
  sessionVersion: number;
  email?: string;
}): Promise<string> {
  const issuedAt = Date.now();
  const email = input.email ? encodeURIComponent(input.email) : "";
  const payload = email
    ? `u:${input.userId}:${input.sessionVersion}:${issuedAt}:${email}`
    : `u:${input.userId}:${input.sessionVersion}:${issuedAt}`;
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
  if (parts[0] !== "u" || (parts.length !== 4 && parts.length !== 5)) return null;
  const userId = parts[1]!;
  const sessionVersion = Number(parts[2]);
  const issuedAt = Number(parts[3]);
  if (!userId || !Number.isFinite(sessionVersion) || !Number.isFinite(issuedAt)) {
    return null;
  }
  const ageMs = Date.now() - issuedAt;
  if (ageMs < 0 || ageMs > MAX_AGE_SECONDS * 1000) return null;
  const email = parts[4] ? decodeURIComponent(parts[4]) : undefined;
  return { userId, sessionVersion, issuedAt, email };
}

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

export function culturalHubUrl() {
  return (
    process.env.NEXT_PUBLIC_CULTURAL_URL ||
    process.env.AUTH_HUB_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function culturalLoginUrl(nextUrl?: string) {
  const login = new URL("/login", `${culturalHubUrl()}/`);
  if (nextUrl) login.searchParams.set("next", nextUrl);
  return login.toString();
}

export function culturalLogoutUrl() {
  return `${culturalHubUrl()}/logout`;
}

export function culturalAccountUrl() {
  return `${culturalHubUrl()}/conta`;
}

/** Destino pós-login do hub (path relativo ou URL absoluta de Origem/Fluxo/Cultural). */
export function safeContinueUrl(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    const allowed = [
      process.env.NEXT_PUBLIC_ORIGEM_URL,
      process.env.NEXT_PUBLIC_FLUXO_URL,
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.NEXT_PUBLIC_CULTURAL_URL,
    ]
      .filter(Boolean)
      .map((value) => String(value).replace(/\/$/, ""));
    if (allowed.some((base) => raw.startsWith(base))) return raw;
    if (url.hostname.endsWith("maxcultural.com.br")) return raw;
  } catch {
    return fallback;
  }
  return fallback;
}
