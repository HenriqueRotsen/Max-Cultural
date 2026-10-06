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
  applyPermissionOverrides,
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
  /** Grants emitidos no login (`u3`). Ausente em tokens antigos. */
  permissions?: string[];
};

export type Pending2faPayload = {
  userId: string;
  issuedAt: number;
};

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(value: string): string {
  const pad = value + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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
    return b64urlDecode(value);
  } catch {
    return value;
  }
}

/**
 * Cookie SSO compartilhado: `u3:userId:version:issuedAt:email:grants`.
 * E-mail e grants em base64url — o valor nunca contém "%", senão o parser
 * de cookies do Next decodifica e a assinatura deixa de bater nos satélites.
 * Os grants viajam no cookie para Origem/Fluxo não consultarem o hub a cada página.
 */
export async function createSessionToken(input: {
  userId: string;
  sessionVersion: number;
  email?: string;
  permissions?: string[];
}): Promise<string> {
  const issuedAt = Date.now();
  const email = input.email ? b64urlEncode(input.email) : "";
  const grants = [...new Set((input.permissions ?? []).map((p) => p.trim()).filter(Boolean))];
  const perms = b64urlEncode(grants.join(","));
  const payload = `u3:${input.userId}:${input.sessionVersion}:${issuedAt}:${email}:${perms}`;
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

  if (parts[0] === "u3" && parts.length === 6) {
    const userId = parts[1]!;
    const sessionVersion = Number(parts[2]);
    const issuedAt = Number(parts[3]);
    if (!userId || !Number.isFinite(sessionVersion) || !Number.isFinite(issuedAt)) {
      return null;
    }
    const ageMs = Date.now() - issuedAt;
    if (ageMs < 0 || ageMs > MAX_AGE_SECONDS * 1000) return null;
    const email = decodeEmail(parts[4]);
    let permissions: string[] = [];
    try {
      const raw = parts[5] ? b64urlDecode(parts[5]) : "";
      permissions = raw ? raw.split(",").filter(Boolean) : [];
    } catch {
      return null;
    }
    return { userId, sessionVersion, issuedAt, email, permissions };
  }

  // Formatos anteriores (`u2`, `u`): sessão válida, grants buscados no hub.
  if (parts[0] === "u2" && parts.length >= 5) {
    const userId = parts[1]!;
    const sessionVersion = Number(parts[2]);
    const issuedAt = Number(parts[3]);
    if (!userId || !Number.isFinite(sessionVersion) || !Number.isFinite(issuedAt)) {
      return null;
    }
    const ageMs = Date.now() - issuedAt;
    if (ageMs < 0 || ageMs > MAX_AGE_SECONDS * 1000) return null;
    return { userId, sessionVersion, issuedAt, email: decodeEmail(parts[4]) };
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

export type HubSessionStatus = "alive" | "revoked" | "unknown";

const ALIVE_TTL_MS = 2 * 60 * 1000;
const aliveCache = new Map<string, { status: HubSessionStatus; checkedAt: number }>();
const aliveInflight = new Map<string, Promise<HubSessionStatus>>();

async function fetchHubSessionAlive(token: string): Promise<HubSessionStatus> {
  let status: HubSessionStatus = "unknown";
  try {
    const base = culturalHubUrl().replace("://localhost", "://127.0.0.1");
    const res = await fetch(`${base}/api/session/alive`, {
      headers: { accept: "application/json", "x-max-session": token },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (res.status === 401) status = "revoked";
    else if (res.ok) status = "alive";
  } catch {
    status = "unknown";
  }
  if (status !== "unknown") {
    if (aliveCache.size > 5000) aliveCache.clear();
    aliveCache.set(token, { status, checkedAt: Date.now() });
  }
  return status;
}

function refreshHubSessionAlive(token: string): Promise<HubSessionStatus> {
  let p = aliveInflight.get(token);
  if (!p) {
    p = fetchHubSessionAlive(token).finally(() => aliveInflight.delete(token));
    aliveInflight.set(token, p);
  }
  return p;
}

/**
 * Confirma no hub se a sessão não foi revogada (sessionVersion).
 * Nunca bloqueia a navegação na rede: sem cache → "unknown" e revalida em
 * background; com cache vivo → responde na hora e revalida a cada 2 min.
 * Só "revoked" (já cacheado) força logout. Hub fora do ar → "unknown"
 * (o satélite segue com os grants do cookie).
 */
export async function checkHubSessionAlive(token: string): Promise<HubSessionStatus> {
  const hit = aliveCache.get(token);
  if (!hit) {
    void refreshHubSessionAlive(token).catch(() => {});
    return "unknown";
  }
  if (hit.status === "alive" && Date.now() - hit.checkedAt > ALIVE_TTL_MS) {
    void refreshHubSessionAlive(token).catch(() => {});
  }
  return hit.status;
}

/** Prefetch/RSC do Next ou do browser — rotas de logout não devem agir nesses casos. */
export function isPrefetchRequest(request: { headers: Headers; url: string }): boolean {
  const h = request.headers;
  if (h.get("next-router-prefetch")) return true;
  if (h.get("rsc")) return true;
  const purpose = `${h.get("purpose") || ""} ${h.get("sec-purpose") || ""}`.toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("prerender")) return true;
  try {
    if (new URL(request.url).searchParams.has("_rsc")) return true;
  } catch {
    // ignore
  }
  return false;
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

/**
 * Limpa cookie via Set-Cookie no header (não usar res.cookies.set depois de
 * writeSessionCookie — no Next isso pode dropar o max_session recém-gravado).
 */
export function clearCookieHeader(
  res: { headers: { append(name: string, value: string): void } },
  name: string,
) {
  for (const opts of clearAuthCookieOptions()) {
    const parts = [`${name}=`, `Path=${opts.path}`, "Max-Age=0", "HttpOnly", "SameSite=Lax"];
    if (opts.domain) parts.push(`Domain=${opts.domain}`);
    res.headers.append("set-cookie", parts.join("; "));
  }
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

/** Hub com aviso (sem `next` para o produto — evita loop login↔satélite). */
export function culturalDeniedUrl(message: string) {
  const url = new URL("/", `${culturalHubUrl()}/`);
  url.searchParams.set("error", message);
  return url.toString();
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
