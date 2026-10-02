import { cache } from "react";
import { cookies, headers } from "next/headers";
import http from "node:http";
import https from "node:https";
import {
  AUTH_COOKIE,
  culturalHubUrl,
  HUB_TO_FLUXO_PERMISSIONS,
  firstValidSessionToken,
  parseSessionToken,
} from "@max/auth";
import type { PermissionCode } from "@/lib/permission-catalog";
import { PERMISSION_CODES } from "@/lib/permission-catalog";

export type HubFluxoAccess = {
  /** Sem cookie hub → null (não intersecta RBAC local). */
  hasHubSession: boolean;
  allowedProduct: boolean;
  codes: Set<PermissionCode>;
  /** Rede/5xx no hub — distinto de 401 (sessão inválida). */
  fetchFailed?: boolean;
};

function hubGet(
  path: string,
  token: string,
  timeoutMs: number,
): Promise<{ status: number; body: string }> {
  const url = new URL(path, `${culturalHubUrl().replace("://localhost", "://127.0.0.1")}/`);
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

function codesFromHubIds(ids: Set<string>, fetchFailed = false): HubFluxoAccess {
  if (!ids.has("fluxo.app")) {
    return { hasHubSession: true, allowedProduct: false, codes: new Set(), fetchFailed };
  }
  const codes = new Set<PermissionCode>();
  for (const [hubId, mapped] of Object.entries(HUB_TO_FLUXO_PERMISSIONS)) {
    if (!ids.has(hubId)) continue;
    for (const code of mapped) {
      if (PERMISSION_CODES.includes(code as PermissionCode)) {
        codes.add(code as PermissionCode);
      }
    }
  }
  codes.add("perfil:write");
  return { hasHubSession: true, allowedProduct: true, codes, fetchFailed };
}

/**
 * Grants do hub para o Fluxo.
 * Tokens `u2` antigos usam cookie; senão GET /api/session/permissions.
 */
export const getHubFluxoAccess = cache(async (): Promise<HubFluxoAccess> => {
  const empty: HubFluxoAccess = {
    hasHubSession: false,
    allowedProduct: false,
    codes: new Set(),
  };

  try {
    const jar = await cookies();
    const token =
      (await firstValidSessionToken((await headers()).get("cookie"))) ||
      jar.get(AUTH_COOKIE)?.value;
    const parsed = token ? await parseSessionToken(token) : null;
    if (!token || !parsed) return empty;

    if (parsed.permissions && parsed.permissions.length > 0) {
      return codesFromHubIds(new Set(parsed.permissions));
    }

    const { status, body } = await hubGet("/api/session/permissions", token, 8000);
    if (status === 401) {
      return { hasHubSession: true, allowedProduct: false, codes: new Set(), fetchFailed: false };
    }
    if (status < 200 || status >= 300) {
      // Hub indisponível: não trancar SSO — libera produto básico.
      return {
        hasHubSession: true,
        allowedProduct: true,
        codes: new Set<PermissionCode>(["perfil:write"]),
        fetchFailed: true,
      };
    }

    const data = JSON.parse(body) as {
      permissions?: unknown;
      entries?: Array<{ screen: string; canView?: boolean; canEdit?: boolean }>;
    };

    const ids = new Set<string>();
    if (Array.isArray(data.permissions)) {
      for (const item of data.permissions) {
        if (typeof item === "string") ids.add(item);
        else if (item && typeof item === "object" && "screen" in item) {
          const row = item as { screen: string; canView?: boolean; canEdit?: boolean };
          if (row.canView || row.canEdit) ids.add(row.screen);
        }
      }
    }
    if (Array.isArray(data.entries)) {
      for (const row of data.entries) {
        if (row.canView || row.canEdit) ids.add(row.screen);
      }
    }

    return codesFromHubIds(ids);
  } catch {
    return {
      hasHubSession: true,
      allowedProduct: true,
      codes: new Set<PermissionCode>(["perfil:write"]),
      fetchFailed: true,
    };
  }
});
