const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export type RecaptchaAction = "formulario_inscricao" | "login";

function cleanEnv(value: string | undefined | null) {
  const v = (value || "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!v || v === "undefined" || v === "null") return "";
  return v;
}

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

export function recaptchaRequired() {
  return recaptchaConfigured();
}

function minScore() {
  const raw = Number(process.env.RECAPTCHA_MIN_SCORE || "0.5");
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
}

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
      return { ok: false, error: "Verificação anti-bot falhou. Tente novamente." };
    }
    if (json.action && json.action !== expectedAction) {
      return { ok: false, error: "Verificação anti-bot inválida (ação)." };
    }
    if (typeof json.score === "number" && json.score < minScore()) {
      return { ok: false, error: "Verificação anti-bot com score baixo. Tente novamente." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível validar o anti-bot. Tente novamente." };
  }
}
