import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimitResult = { allowed: true } | { allowed: false; retryAfterSec: number };

let inscricaoLimiter: Ratelimit | null | undefined;
let formularioLimiter: Ratelimit | null | undefined;

function upstashConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function getInscricaoLimiter(): Ratelimit | null {
  if (inscricaoLimiter !== undefined) return inscricaoLimiter;
  if (!upstashConfigured()) {
    inscricaoLimiter = null;
    return null;
  }
  inscricaoLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    prefix: "fluxo:inscricao",
    analytics: false,
  });
  return inscricaoLimiter;
}

function getFormularioLimiter(): Ratelimit | null {
  if (formularioLimiter !== undefined) return formularioLimiter;
  if (!upstashConfigured()) {
    formularioLimiter = null;
    return null;
  }
  formularioLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(8, "1 h"),
    prefix: "fluxo:formulario",
    analytics: false,
  });
  return formularioLimiter;
}

export function inscricaoRateLimitRequired() {
  return process.env.NODE_ENV === "production" && upstashConfigured();
}

/** Mesmo critério da inscrição legada: produção + Upstash. */
export function formularioRateLimitRequired() {
  return process.env.NODE_ENV === "production" && upstashConfigured();
}

async function checkLimiter(
  limiter: Ratelimit | null,
  key: string,
): Promise<LimitResult> {
  if (!limiter) return { allowed: true };

  const result = await limiter.limit(key);
  if (result.success) return { allowed: true };

  const retryAfterSec = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000),
  );
  return { allowed: false, retryAfterSec };
}

export async function checkInscricaoRateLimit(
  key: string,
): Promise<LimitResult> {
  return checkLimiter(getInscricaoLimiter(), key);
}

export async function checkFormularioRateLimit(
  key: string,
): Promise<LimitResult> {
  return checkLimiter(getFormularioLimiter(), key);
}
