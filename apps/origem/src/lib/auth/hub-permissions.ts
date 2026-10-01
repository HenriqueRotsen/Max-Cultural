import { cache } from "react";
import { cookies } from "next/headers";
import http from "node:http";
import https from "node:https";
import { AUTH_COOKIE, culturalHubUrl } from "@max/auth";

export type HubPermissionsPayload = {
  ids: Set<string>;
  /** Compat: entradas antigas screen/canView/canEdit */
  entries: Array<{ screen: string; canView: boolean; canEdit: boolean }>;
  /** true quando a API do hub falhou (rede/401) — distinto de “sem grants”. */
  fetchFailed?: boolean;
};

function hubBaseForServer(): string {
  // Evita ::1 vs 127.0.0.1 em algumas stacks locais.
  return culturalHubUrl().replace("://localhost", "://127.0.0.1");
}

function fetchHubPermissionsJson(
  hubBase: string,
  token: string,
): Promise<{ status: number; body: string }> {
  const url = new URL("/api/session/permissions", `${hubBase}/`);
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
        timeout: 8000,
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
      reject(new Error("hub permissions timeout"));
    });
    req.end();
  });
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

/**
 * Busca permissões do hub Cultural para a sessão atual.
 * Deny-by-default: falha de rede / 401 → set vazio + fetchFailed.
 */
export const getHubPermissions = cache(async (): Promise<HubPermissionsPayload> => {
  try {
    const jar = await cookies();
    const token = jar.get(AUTH_COOKIE)?.value;
    if (!token) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[hub-permissions] sem cookie max_session");
      }
      return { ids: new Set(), entries: [], fetchFailed: true };
    }

    const hub = hubBaseForServer();
    const { status, body } = await fetchHubPermissionsJson(hub, token);
    if (status < 200 || status >= 300) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[hub-permissions] hub status", status, hub, body.slice(0, 120));
      }
      return { ids: new Set(), entries: [], fetchFailed: true };
    }

    return parsePermissionsPayload(body);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[hub-permissions] erro", err);
    }
    return { ids: new Set(), entries: [], fetchFailed: true };
  }
});

export async function hasHubPermission(permissionId: string): Promise<boolean> {
  const { ids, fetchFailed } = await getHubPermissions();
  if (ids.has("*")) return true;
  // Capacidades privilegiadas: sem resposta do hub → negar.
  // Entrada no produto é tratada no layout (permite se SSO ok e fetch falhou).
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
