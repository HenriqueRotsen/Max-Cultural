const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export type RecaptchaAction = "login" | "password_reset" | "signup";

/** Normaliza env: tira aspas/espacos e trata placeholder vazio. */
function cleanEnv(value: string | undefined | null) {
  const v = (value || "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!v || v === "undefined" || v === "null") return "";
  return v;
}

/**
 * Captcha só liga com flag explícita + as duas keys.
 * Evita login travado quando a site key/domínio do Google está inválido.
 */
export function recaptchaEnabled() {
  const flag = cleanEnv(
    process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED || process.env.RECAPTCHA_ENABLED,
  ).toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function recaptchaSiteKey() {
  if (!recaptchaEnabled()) return "";
  return cleanEnv(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
}

export function recaptchaSecretKey() {
  return cleanEnv(process.env.RECAPTCHA_SECRET_KEY);
}

export function recaptchaConfigured() {
  return Boolean(
    recaptchaEnabled() &&
      cleanEnv(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) &&
      recaptchaSecretKey(),
  );
}

/** Exige verificação quando captcha está ligado e as keys existem. */
export function recaptchaRequired() {
  return recaptchaConfigured();
}

function minScore() {
  const raw = Number(process.env.RECAPTCHA_MIN_SCORE || "0.5");
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
}

/**
 * Valida token reCAPTCHA v3.
 * Sem keys → libera (dev). Com keys e token inválido/score baixo → false.
 */
export async function verifyRecaptchaToken(
  token: string | undefined | null,
  expectedAction: RecaptchaAction,
  remoteIp?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!recaptchaRequired()) return { ok: true };

  const secret = recaptchaSecretKey();
  const response = token?.trim();
  if (!response) {
    return { ok: false, error: "Confirmação anti-bot ausente. Recarregue a página." };
  }

  const body = new URLSearchParams({
    secret,
    response,
    ...(remoteIp ? { remoteip: remoteIp } : {}),
  });

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      score?: number;
      action?: string;
      "error-codes"?: string[];
    };

    if (!json.success) {
      return { ok: false, error: "Falha na verificação anti-bot. Tente de novo." };
    }
    if (json.action && json.action !== expectedAction) {
      return { ok: false, error: "Falha na verificação anti-bot. Tente de novo." };
    }
    const score = typeof json.score === "number" ? json.score : 0;
    if (score < minScore()) {
      return { ok: false, error: "Não foi possível validar o acesso. Tente de novo." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível validar o anti-bot. Tente de novo." };
  }
}
