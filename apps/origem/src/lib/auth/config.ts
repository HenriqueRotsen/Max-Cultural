function envFlag(name: string) {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * App aberto sem login (só local/debug).
 * Preferir `ORIGEM_DEV_OPEN`. Aceita legado `SALINK_DEV_OPEN`.
 * Login e 2FA do produto ficam no MAX Cultural (`AUTH_2FA_DISABLED` no hub).
 */
export function isDevOpenAuth() {
  return envFlag("ORIGEM_DEV_OPEN") || envFlag("SALINK_DEV_OPEN");
}

/**
 * Demo público: sem login, amostra ~10% dos dados, CTA na landing.
 * Preferir `ORIGEM_DEMO` / `NEXT_PUBLIC_ORIGEM_DEMO`.
 * Aceita legado `SALINK_DEMO` / `NEXT_PUBLIC_SALINK_DEMO`.
 */
export function isDemoMode() {
  return (
    envFlag("ORIGEM_DEMO") ||
    envFlag("NEXT_PUBLIC_ORIGEM_DEMO") ||
    envFlag("SALINK_DEMO") ||
    envFlag("NEXT_PUBLIC_SALINK_DEMO")
  );
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

/** Se false: layout/proxy não exigem login (dev aberto / demo). */
export function isAuthEnabled() {
  if (isDemoMode()) return false;
  if (isDevOpenAuth()) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (looksLikePlaceholder(url, anon)) return false;
  return true;
}

/** Login no hub MAX Cultural, salvo demo público ou ORIGEM_DEV_OPEN. */
export function needsLogin() {
  if (isDemoMode() || isDevOpenAuth()) return false;
  return true;
}
