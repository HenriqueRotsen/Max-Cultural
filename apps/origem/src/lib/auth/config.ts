/**
 * Auth do MAX Origem: login e 2FA ficam no hub MAX Cultural.
 * Este app só consome o cookie SSO (`AUTH_SECRET` + `NEXT_PUBLIC_CULTURAL_URL`).
 */

/** Com hub SSO configurado, auth está ligada. */
export function isAuthEnabled() {
  const secret = (process.env.AUTH_SECRET || "").trim();
  const hub = (process.env.NEXT_PUBLIC_CULTURAL_URL || "").trim();
  return Boolean(secret && hub);
}
