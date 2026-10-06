import { cache } from "react";
import http from "node:http";
import https from "node:https";
import { checkHubSessionAlive, culturalHubUrl, parseSessionToken } from "@max/auth";
import { getHubSessionToken } from "@/lib/auth/hub";

export type HubPermissionsPayload = {
  ids: Set<string>;
  /** Compat: entradas antigas screen/canView/canEdit */
  entries: Array<{ screen: string; canView: boolean; canEdit: boolean }>;
  /** true quando a API do hub falhou por rede/5xx — distinto de 401 (sessão inválida). */
  fetchFailed?: boolean;
  /** Sessão revogada no hub (sessionVersion mudou) ou ausente. */
  revoked?: boolean;
};

function hubBaseForServer(): string {
  return culturalHubUrl().replace("://localhost", "://127.0.0.1");
}

function hubGet(
  path: string,
  token: string,
  timeoutMs: number,
): Promise<{ status: number; body: string }> {
  const url = new URL(path, `${hubBaseForServer()}/`);
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          "x-max-session": token,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("hub request timeout"));
    });
    req.end();
  });
}

function payloadFromIds(ids: Iterable<string>): HubPermissionsPayload {
  const set = new Set(ids);
  const entries = [...set].map((screen) => ({
    screen,
    canView: true,
    canEdit: true,
  }));
  return { ids: set, entries, fetchFailed: false };
}

function parsePermissionsPayload(raw: string): HubPermissionsPayload {
  const ids = new Set<string>();
  const entries: HubPermissionsPayload["entries"] = [];
  let data: {
    permissions?: unknown;
    entries?: Array<{ screen: string; canView?: boolean; canEdit?: boolean }>;
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return { ids, entries, fetchFailed: true };
  }

  if (Array.isArray(data.permissions)) {
    for (const item of data.permissions) {
      if (typeof item === "string") {
        ids.add(item);
        entries.push({ screen: item, canView: true, canEdit: true });
      } else if (item && typeof item === "object" && "screen" in item) {
        const row = item as { screen: string; canView?: boolean; canEdit?: boolean };
        if (row.canView || row.canEdit) ids.add(row.screen);
        entries.push({
          screen: row.screen,
          canView: Boolean(row.canView),
          canEdit: Boolean(row.canEdit),
        });
      }
    }
  }

  if (Array.isArray(data.entries)) {
    for (const row of data.entries) {
      if (row.canView || row.canEdit) ids.add(row.screen);
    }
  }

  return { ids, entries, fetchFailed: false };
}

const LEGACY_TTL_MS = 2 * 60 * 1000;
const legacyCache = new Map<string, { payload: HubPermissionsPayload; at: number }>();

const REVOKED: HubPermissionsPayload = { ids: new Set(), entries: [], fetchFailed: false, revoked: true };

/**
 * Permissões do hub, carregadas no login e gravadas no cookie SSO (`u3`).
 * A única ida ao hub é a checagem de revogação (não bloqueia nav; ver checkHubSessionAlive).
 * Tokens antigos sem grants consultam /api/session/permissions (com cache).
 */
export const getHubPermissions = cache(async (): Promise<HubPermissionsPayload> => {
  try {
    const token = await getHubSessionToken();
    if (!token) return REVOKED;
    const parsed = await parseSessionToken(token);
    if (!parsed) return REVOKED;

    if (parsed.permissions) {
      const status = await checkHubSessionAlive(token);
      if (status === "revoked") return REVOKED;
      return payloadFromIds(parsed.permissions);
    }

    const hit = legacyCache.get(token);
    if (hit && Date.now() - hit.at < LEGACY_TTL_MS) return hit.payload;

    const { status, body } = await hubGet("/api/session/permissions", token, 4000);
    if (status === 401) return REVOKED;
    if (status < 200 || status >= 300) {
      return { ids: new Set(), entries: [], fetchFailed: true };
    }
    const payload = parsePermissionsPayload(body);
    if (!payload.fetchFailed) {
      if (legacyCache.size > 2000) legacyCache.clear();
      legacyCache.set(token, { payload, at: Date.now() });
    }
    return payload;
  } catch {
    return { ids: new Set(), entries: [], fetchFailed: true };
  }
});

export async function hasHubPermission(permissionId: string): Promise<boolean> {
  const { ids, fetchFailed } = await getHubPermissions();
  if (ids.has("*")) return true;
  if (fetchFailed) return false;
  return ids.has(permissionId);
}

export async function requireHubPermission(permissionId: string): Promise<boolean> {
  return hasHubPermission(permissionId);
}

/** Mapa path → tela do hub (módulo). */
export function hubScreenForPath(pathname: string): string | null {
  if (pathname === "/painel" || pathname === "/") return null;
  if (pathname.startsWith("/planejamento")) return "origem.planejamento";
  if (pathname.startsWith("/contas")) return "origem.proponentes";
  if (pathname.startsWith("/fornecedores")) return "origem.fornecedores";
  if (
    pathname.startsWith("/inicio") ||
    pathname.startsWith("/panorama") ||
    pathname.startsWith("/auditoria") ||
    pathname.startsWith("/sync") ||
    pathname.startsWith("/observados")
  ) {
    return "origem.auditoria";
  }
  return null;
}
