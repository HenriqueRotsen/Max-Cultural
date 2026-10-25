import { cookies } from "next/headers";
import http from "node:http";
import https from "node:https";
import { AUTH_COOKIE, culturalHubUrl } from "@max/auth";

export type HubAuditPayload = {
  action: string;
  screen?: string;
  entityType?: string;
  entityId?: string;
  meta?: unknown;
  ip?: string | null;
  occurredAt?: string;
};

function hubBaseForServer(): string {
  return culturalHubUrl().replace("://localhost", "://127.0.0.1");
}

function postJson(
  hubBase: string,
  token: string,
  payload: HubAuditPayload,
): Promise<{ status: number }> {
  const url = new URL("/api/audit", `${hubBase}/`);
  const lib = url.protocol === "https:" ? https : http;
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          authorization: `Bearer ${token}`,
          "x-max-session": token,
        },
        timeout: 8000,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode || 0 }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("hub audit timeout"));
    });
    req.write(body);
    req.end();
  });
}

/** Envia evento de auditoria ao hub Cultural. Retorna true se gravou. */
export async function postHubAudit(payload: HubAuditPayload): Promise<boolean> {
  try {
    const jar = await cookies();
    const token = jar.get(AUTH_COOKIE)?.value;
    if (!token) return false;
    const hub = hubBaseForServer();
    if (!hub) return false;
    const { status } = await postJson(hub, token, payload);
    return status >= 200 && status < 300;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[hub-audit]", err);
    }
    return false;
  }
}
