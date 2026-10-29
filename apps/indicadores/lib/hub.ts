import { culturalHubUrl, culturalLoginUrl, culturalLogoutUrl, culturalDeniedUrl } from "@max/auth";
import { redirect } from "next/navigation";

export function indicadoresPublicUrl(path = "/dashboard") {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002").replace(
    /\/$/,
    "",
  );
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function indicadoresHubLoginUrl(path = "/dashboard") {
  return culturalLoginUrl(indicadoresPublicUrl(path));
}

export function indicadoresHubLogoutUrl() {
  return culturalLogoutUrl();
}

export function indicadoresHubHomeUrl() {
  return culturalHubUrl();
}

export function indicadoresHubAccountUrl() {
  return `${culturalHubUrl()}/conta`;
}

export function redirectToHubLogin(path = "/dashboard"): never {
  redirect(indicadoresHubLoginUrl(path));
}

export function redirectToHubHome(): never {
  redirect(indicadoresHubHomeUrl());
}

/** Sem acesso ao produto: volta ao hub com aviso (nunca /login?next=… — causa loop). */
export function redirectToHubDenied(
  message = "Sem acesso ao MAX Indicadores.",
): never {
  redirect(culturalDeniedUrl(message));
}
