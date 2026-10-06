"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import type { RecaptchaAction } from "@/lib/recaptcha";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const SCRIPT_ID = "google-recaptcha-v3";

function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha) {
    return new Promise((resolve) => window.grecaptcha!.ready(() => resolve()));
  }
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.grecaptcha) {
        window.grecaptcha.ready(() => resolve());
        return;
      }
      existing.addEventListener("load", () => {
        window.grecaptcha?.ready(() => resolve());
      });
      existing.addEventListener("error", () => reject(new Error("recaptcha load")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.onload = () => window.grecaptcha?.ready(() => resolve());
    script.onerror = () => reject(new Error("recaptcha load"));
    document.head.appendChild(script);
  });
}

export async function executeRecaptcha(
  siteKey: string,
  action: RecaptchaAction,
): Promise<string> {
  await loadRecaptchaScript(siteKey);
  if (!window.grecaptcha) throw new Error("reCAPTCHA indisponível");
  return window.grecaptcha.execute(siteKey, { action });
}

type FormProps = {
  action: RecaptchaAction;
  siteKey: string;
  children: ReactNode;
  className?: string;
  /** action nativa / server action do form */
  formAction?: string | ((formData: FormData) => void | Promise<void>);
  method?: string;
  onError?: (message: string) => void;
};

/**
 * Intercepta o submit, obtém token v3 e inclui em `recaptchaToken`.
 * Sem siteKey, deixa o form seguir normal.
 */
export function RecaptchaForm({
  action,
  siteKey,
  children,
  className,
  formAction,
  method = "post",
  onError,
}: FormProps) {
  const tokenRef = useRef<HTMLInputElement>(null);
  const locking = useRef(false);
  const armed = Boolean(siteKey);

  useEffect(() => {
    if (!armed) return;
    void loadRecaptchaScript(siteKey).catch(() => {});
  }, [armed, siteKey]);

  const onSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      if (!armed) return;
      const form = e.currentTarget;

      // Token já preenchido nesta rodada → deixa o browser/server action seguir.
      if (form.dataset.recaptchaReady === "1") {
        form.dataset.recaptchaReady = "0";
        return;
      }

      e.preventDefault();
      if (locking.current) return;
      locking.current = true;
      try {
        const token = await executeRecaptcha(siteKey, action);
        const input = tokenRef.current;
        if (input) input.value = token;
        form.dataset.recaptchaReady = "1";

        const isStringAction = typeof formAction === "string" && formAction.length > 0;
        if (isStringAction) {
          // POST clássico (login): evita interferência do React no FormData.
          HTMLFormElement.prototype.submit.call(form);
          return;
        }
        form.requestSubmit();
      } catch {
        onError?.("Não foi possível carregar a verificação anti-bot.");
      } finally {
        locking.current = false;
      }
    },
    [action, armed, formAction, onError, siteKey],
  );

  return (
    <form
      className={className}
      action={formAction}
      method={method}
      onSubmit={onSubmit}
    >
      {/* defaultValue: não controlar o token (value="" apagava no re-render). */}
      <input
        ref={tokenRef}
        type="hidden"
        name="recaptchaToken"
        defaultValue=""
        autoComplete="off"
      />
      {children}
    </form>
  );
}
