import {
  AUTH_COOKIE,
  culturalHubUrl,
  culturalLoginUrl,
  culturalLogoutUrl,
  parseSessionToken,
} from "@max/auth";
import { cookies } from "next/headers";

export { AUTH_COOKIE, culturalLoginUrl, culturalLogoutUrl };

export function isHubSsoEnabled() {
  const hub = (
    process.env.NEXT_PUBLIC_CULTURAL_URL ||
    process.env.AUTH_HUB_URL ||
    ""
  ).trim();
  const secret = (process.env.AUTH_SECRET || "").trim();
  return Boolean(hub && secret);
}

export function origemPublicUrl(path = "/painel") {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(
    /\/$/,
    "",
  );
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${site}${path.startsWith("/") ? path : `/${path}`}`;
}

export function origemHubLoginUrl(path = "/painel") {
  return culturalLoginUrl(origemPublicUrl(path));
}

export function origemHubLogoutUrl() {
  return culturalLogoutUrl();
}

export function origemHubAccountUrl() {
  return `${culturalHubUrl()}/conta`;
}

export async function getHubSessionPayload() {
  if (!isHubSsoEnabled()) return null;
  try {
    const jar = await cookies();
    return parseSessionToken(jar.get(AUTH_COOKIE)?.value);
  } catch {
    return null;
  }
}
