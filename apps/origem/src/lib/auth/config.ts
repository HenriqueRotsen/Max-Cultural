import { isHubSsoEnabled } from "@/lib/auth/hub";

function envFlag(name: string) {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Auth ligada só com Supabase real.
 * `SALINK_DEV_OPEN=1` força app aberto (local), mesmo com vars preenchidas.
 */
export function isDevOpenAuth() {
  return envFlag("SALINK_DEV_OPEN");
}

/**
 * Demo público: sem login, amostra ~10% dos dados, CTA na landing.
 * Aceita `SALINK_DEMO` ou `NEXT_PUBLIC_SALINK_DEMO`.
 */
export function isDemoMode() {
  return envFlag("SALINK_DEMO") || envFlag("NEXT_PUBLIC_SALINK_DEMO");
}

function looksLikePlaceholder(url: string, anon: string) {
  return (
    !url ||
    !anon ||
    url.includes("YOUR_PROJECT") ||
    anon === "your-anon-key" ||
    anon.startsWith("your-")
  );
}

/** Se false: layout/proxy não exigem login (workspace bootstrap Pro / demo). */
export function isAuthEnabled() {
  if (isDemoMode()) return false;
  if (isDevOpenAuth()) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (looksLikePlaceholder(url, anon)) return false;
  return true;
}

/** Login local (Supabase) ou sessão do hub MAX Cultural. */
export function needsLogin() {
  if (isDemoMode() || isDevOpenAuth()) return false;
  return isAuthEnabled() || isHubSsoEnabled();
}
