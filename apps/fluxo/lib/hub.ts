import { culturalHubUrl, culturalLoginUrl, culturalLogoutUrl } from "@max/auth";
import { redirect } from "next/navigation";

export function fluxoPublicUrl(path = "/dashboard") {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002").replace(
    /\/$/,
    "",
  );
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function fluxoHubLoginUrl(path = "/dashboard") {
  return culturalLoginUrl(fluxoPublicUrl(path));
}

export function fluxoHubLogoutUrl() {
  return culturalLogoutUrl();
}

export function fluxoHubHomeUrl() {
  return culturalHubUrl();
}

export function fluxoHubAccountUrl() {
  return `${culturalHubUrl()}/conta`;
}

export function redirectToHubLogin(path = "/dashboard"): never {
  redirect(fluxoHubLoginUrl(path));
}

export function redirectToHubHome(): never {
  redirect(fluxoHubHomeUrl());
}
