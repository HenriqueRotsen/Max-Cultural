const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export type RecaptchaAction = "login" | "password_reset" | "signup";

export function recaptchaSiteKey() {
  return (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();
}

export function recaptchaConfigured() {
  return Boolean(recaptchaSiteKey() && process.env.RECAPTCHA_SECRET_KEY?.trim());
}

/** Exige verificação quando as duas keys estão configuradas. */
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

  const secret = process.env.RECAPTCHA_SECRET_KEY!.trim();
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
