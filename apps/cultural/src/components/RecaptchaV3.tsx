"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
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

/** Badge/disclaimer exigido pelo Google quando o badge fica discreto. */
export function RecaptchaLegalNote() {
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-[var(--gray-400)]">
      Protegido por reCAPTCHA. Aplicam-se a{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        Privacidade
      </a>{" "}
      e os{" "}
      <a
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        Termos
      </a>{" "}
      do Google.
    </p>
  );
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
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const armed = Boolean(siteKey);

  useEffect(() => {
    if (!armed) return;
    void loadRecaptchaScript(siteKey).catch(() => {});
  }, [armed, siteKey]);

  const onSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      if (!armed) return;
      const form = e.currentTarget;
      // Já temos token fresco → deixa seguir (submit nativo / server action).
      if (form.dataset.recaptchaReady === "1") {
        form.dataset.recaptchaReady = "0";
        return;
      }
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        const token = await executeRecaptcha(siteKey, action);
        if (tokenRef.current) tokenRef.current.value = token;
        form.dataset.recaptchaReady = "1";
        // requestSubmit respeita server actions; form.submit() nativo as ignora.
        form.requestSubmit();
      } catch {
        onError?.("Não foi possível carregar a verificação anti-bot.");
      } finally {
        setBusy(false);
      }
    },
    [action, armed, busy, onError, siteKey],
  );

  return (
    <form
      ref={formRef}
      className={className}
      action={formAction}
      method={method}
      onSubmit={onSubmit}
    >
      <input ref={tokenRef} type="hidden" name="recaptchaToken" value="" />
      {children}
      {armed ? (
        <p className="sr-only" aria-live="polite">
          {busy ? "Validando…" : ""}
        </p>
      ) : null}
    </form>
  );
}
