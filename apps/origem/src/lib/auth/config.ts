/**
 * Auth do MAX Origem: login e 2FA ficam no hub MAX Cultural.
 * Este app só consome o cookie SSO (`AUTH_SECRET` + `NEXT_PUBLIC_CULTURAL_URL`).
 */

function envFlag(name: string) {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** @deprecated Mantido só por compat; não usar em produção. */
export function isDevOpenAuth() {
  return false;
}

/** @deprecated Mantido só por compat; não usar em produção. */
export function isDemoMode() {
  return (
    envFlag("ORIGEM_DEMO") ||
    envFlag("NEXT_PUBLIC_ORIGEM_DEMO") ||
    envFlag("SALINK_DEMO") ||
    envFlag("NEXT_PUBLIC_SALINK_DEMO")
  );
}

/** Com hub SSO configurado, auth está ligada. */
export function isAuthEnabled() {
  if (isDemoMode()) return false;
  const secret = (process.env.AUTH_SECRET || "").trim();
  const hub = (process.env.NEXT_PUBLIC_CULTURAL_URL || "").trim();
  return Boolean(secret && hub);
}

/** Sempre exige login no Cultural (exceto demo legado, se alguém ainda setar). */
export function needsLogin() {
  if (isDemoMode()) return false;
  return true;
}
