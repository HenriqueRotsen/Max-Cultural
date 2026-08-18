import {
  AUTH_COOKIE,
  culturalLoginUrl,
  parseSessionToken,
} from "@max/auth";
import { cookies } from "next/headers";

export { AUTH_COOKIE, culturalLoginUrl };

export function isHubSsoEnabled() {
  const hub = (
    process.env.NEXT_PUBLIC_CULTURAL_URL ||
    process.env.AUTH_HUB_URL ||
    ""
  ).trim();
  const secret = (process.env.AUTH_SECRET || "").trim();
  return Boolean(hub && secret);
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
