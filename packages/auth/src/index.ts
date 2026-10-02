/** Sessão HMAC compartilhada entre Cultural, Origem e Fluxo. */

export {
  ACCESS_CATALOG,
  ACCESS_PERMISSION_IDS,
  ACCESS_BY_ID,
  ORIGEM_PRIVILEGED_CAPABILITIES,
  HUB_TO_FLUXO_PERMISSIONS,
  isAccessPermissionId,
  childrenOf,
  productSections,
  grantedIdsFromRoleRows,
  normalizeGrantedIds,
  type AccessKind,
  type AccessProductGroup,
  type AccessCatalogEntry,
  type AccessPermissionId,
} from "./access-catalog";


export const AUTH_COOKIE = "max_session";
export const PENDING_2FA_COOKIE = "max_pending_2fa";
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const PENDING_2FA_MAX_AGE = 60 * 10;

function cookieDomain(): string | undefined {
  const fromEnv = (process.env.AUTH_COOKIE_DOMAIN || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^\./, "");
  if (fromEnv) return fromEnv;
  // Produção sem env: domínio compartilhado Cultural/Origem/Fluxo.
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return "maxcultural.com.br";
  }
  return undefined;
}

export function sessionCookieOptions(maxAge: number) {
  const domain = cookieDomain();
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure:
      process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
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

/** Limpa host-only e Domain cookie (evita SSO “fantasma” após logout). */
export function clearAuthCookieOptions(): Array<{
  path: string;
  maxAge: number;
  domain?: string;
}> {
  const domain = cookieDomain();
  const base = { path: "/", maxAge: 0 };
  return domain ? [base, { ...base, domain }] : [base];
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
  /** Grants embutidos (tokens `u2` antigos). Tokens novos usam a API do hub. */
  permissions?: string[];
};

export type Pending2faPayload = {
  userId: string;
  issuedAt: number;
};

function encodeEmail(email: string): string {
  const bytes = new TextEncoder().encode(email);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.includes("%")) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  if (value.includes("@")) return value;
  try {
    const pad = value + "=".repeat((4 - (value.length % 4)) % 4);
    const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

/**
 * Cookie SSO compartilhado. Formato estável `u:` (com e-mail) —
 * Origem/Fluxo resolvem grants via /api/session/permissions.
 * Ainda lê tokens `u2` emitidos entre deploys.
 */
export async function createSessionToken(input: {
  userId: string;
  sessionVersion: number;
  email?: string;
  /** Ignorado na emissão — mantido só p/ compat de assinatura. */
  permissions?: string[];
}): Promise<string> {
  const issuedAt = Date.now();
  // base64url: o cookie não contém "%" — senão o parser do Next decodifica
  // o valor e a assinatura deixa de bater no Origem/Fluxo (loop de login).
  const email = input.email ? encodeEmail(input.email) : "";
  const payload = email
    ? `u:${input.userId}:${input.sessionVersion}:${issuedAt}:${email}`
    : `u:${input.userId}:${input.sessionVersion}:${issuedAt}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

async function payloadMatchingSignature(
  payload: string,
  signature: string,
): Promise<string | null> {
  if (timingSafeEqualString(await sign(payload), signature)) return payload;
  // cookies().get() decodifica %40 → @ e invalida a assinatura do token antigo.
  const parts = payload.split(":");
  if (parts.length >= 5 && parts[4]?.includes("@")) {
    const repaired = [
      parts[0],
      parts[1],
      parts[2],
      parts[3],
      encodeURIComponent(parts[4]!),
      ...parts.slice(5),
    ].join(":");
    if (timingSafeEqualString(await sign(repaired), signature)) return repaired;
  }
  return null;
}

export async function parseSessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  if (token.includes("%3A") || token.includes("%3a")) {
    try {
      const decoded = decodeURIComponent(token);
      if (decoded !== token) {
        const parsed = await parseSessionToken(decoded);
        if (parsed) return parsed;
      }
    } catch {
      // segue com o valor cru
    }
  }
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const rawPayload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const payload = await payloadMatchingSignature(rawPayload, signature);
  if (!payload) return null;

  const parts = payload.split(":");

  // Tokens `u2` emitidos no deploy anterior (ainda válidos até expirar / re-login).
  if (parts[0] === "u2" && parts.length >= 5) {
    const userId = parts[1]!;
    const sessionVersion = Number(parts[2]);
    const issuedAt = Number(parts[3]);
    if (!userId || !Number.isFinite(sessionVersion) || !Number.isFinite(issuedAt)) {
      return null;
    }
    const ageMs = Date.now() - issuedAt;
    if (ageMs < 0 || ageMs > MAX_AGE_SECONDS * 1000) return null;
    const email = decodeEmail(parts[4]);
    const permissionsRaw = parts[5] ? decodeURIComponent(parts[5]) : "";
    const permissions = permissionsRaw
      ? permissionsRaw.split(",").map((p) => p.trim()).filter(Boolean)
      : undefined;
    return { userId, sessionVersion, issuedAt, email, permissions };
  }

  if (parts[0] !== "u" || (parts.length !== 4 && parts.length !== 5)) return null;
  const userId = parts[1]!;
  const sessionVersion = Number(parts[2]);
  const issuedAt = Number(parts[3]);
  if (!userId || !Number.isFinite(sessionVersion) || !Number.isFinite(issuedAt)) {
    return null;
  }
  const ageMs = Date.now() - issuedAt;
  if (ageMs < 0 || ageMs > MAX_AGE_SECONDS * 1000) return null;
  const email = decodeEmail(parts[4]);
  return { userId, sessionVersion, issuedAt, email };
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  return (await parseSessionToken(token)) !== null;
}

/** Todos os `max_session` do header (host-only e Domain podem coexistir). */
export function sessionTokenCandidates(
  cookieHeader: string | null | undefined,
): string[] {
  if (!cookieHeader) return [];
  const out: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== AUTH_COOKIE) continue;
    const raw = trimmed.slice(eq + 1);
    if (!raw) continue;
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded && decoded !== raw) out.push(decoded);
    } catch {
      // valor cru
    }
    out.push(raw);
  }
  return out;
}

/** Aceita qualquer cópia válida do cookie, mesmo se outra (sombra) vier primeiro. */
export async function firstValidSessionToken(
  cookieHeader: string | null | undefined,
): Promise<string | null> {
  for (const token of sessionTokenCandidates(cookieHeader)) {
    try {
      if (await parseSessionToken(token)) return token;
    } catch {
      return null;
    }
  }
  return null;
}

export function writeSessionCookie(
  res: { headers: { append(name: string, value: string): void } },
  token: string,
) {
  const opts = sessionCookieOptions(MAX_AGE_SECONDS);
  const base = [
    `${AUTH_COOKIE}=${token}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (opts.secure) base.push("Secure");
  if (opts.domain) base.push(`Domain=${opts.domain}`);
  res.headers.append("set-cookie", base.join("; "));
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
