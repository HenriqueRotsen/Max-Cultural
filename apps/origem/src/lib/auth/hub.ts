import {
  AUTH_COOKIE,
  culturalHubUrl,
  culturalLoginUrl,
  culturalLogoutUrl,
  firstValidSessionToken,
  parseSessionToken,
} from "@max/auth";
import { cookies, headers } from "next/headers";
import { cache } from "react";

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

/** Token SSO válido da requisição (assinatura conferida). */
export const getHubSessionToken = cache(async (): Promise<string | null> => {
  if (!isHubSsoEnabled()) return null;
  try {
    const header = (await headers()).get("cookie");
    const token =
      (await firstValidSessionToken(header)) ||
      (await cookies()).get(AUTH_COOKIE)?.value ||
      null;
    return (await parseSessionToken(token)) ? token : null;
  } catch {
    return null;
  }
});

export const getHubSessionPayload = cache(async () => {
  const token = await getHubSessionToken();
  return token ? parseSessionToken(token) : null;
});
