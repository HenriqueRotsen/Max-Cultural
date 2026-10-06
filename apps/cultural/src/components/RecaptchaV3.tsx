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
const EXECUTE_TIMEOUT_MS = 12_000;

function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha) {
    return new Promise((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("recaptcha ready timeout")), 8_000);
      window.grecaptcha!.ready(() => {
        window.clearTimeout(t);
        resolve();
      });
    });
  }
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("recaptcha load timeout")), 8_000);
      const done = () => {
        window.clearTimeout(t);
        if (!window.grecaptcha) {
          reject(new Error("recaptcha missing"));
          return;
        }
        window.grecaptcha.ready(() => resolve());
      };
      if (window.grecaptcha) {
        done();
        return;
      }
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener(
        "error",
        () => {
          window.clearTimeout(t);
          reject(new Error("recaptcha load"));
        },
        { once: true },
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    const t = window.setTimeout(() => reject(new Error("recaptcha load timeout")), 8_000);
    script.onload = () => {
      window.clearTimeout(t);
      if (!window.grecaptcha) {
        reject(new Error("recaptcha missing"));
        return;
      }
      window.grecaptcha.ready(() => resolve());
    };
    script.onerror = () => {
      window.clearTimeout(t);
      reject(new Error("recaptcha load"));
    };
    document.head.appendChild(script);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (err) => {
        window.clearTimeout(t);
        reject(err);
      },
    );
  });
}

export async function executeRecaptcha(
  siteKey: string,
  action: RecaptchaAction,
): Promise<string> {
  await loadRecaptchaScript(siteKey);
  if (!window.grecaptcha) throw new Error("reCAPTCHA indisponível");
  const token = await withTimeout(
    window.grecaptcha.execute(siteKey, { action }),
    EXECUTE_TIMEOUT_MS,
    "recaptcha execute timeout",
  );
  if (!token?.trim()) throw new Error("recaptcha empty token");
  return token;
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
  onBusyChange?: (busy: boolean) => void;
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
  onBusyChange,
}: FormProps) {
  const tokenRef = useRef<HTMLInputElement>(null);
  const locking = useRef(false);
  const [busy, setBusy] = useState(false);
  const key = siteKey.trim();
  const armed = key.length > 0 && !/^["']+$/.test(key);

  useEffect(() => {
    if (!armed) return;
    void loadRecaptchaScript(key).catch(() => {});
  }, [armed, key]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const onSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      if (!armed) return;

      const form = e.currentTarget;

      // Segunda passagem: token já no form → deixa o browser/server action seguir.
      if (form.dataset.recaptchaReady === "1") {
        form.dataset.recaptchaReady = "0";
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (locking.current) return;
      locking.current = true;
      setBusy(true);
      onError?.("");

      try {
        const token = await executeRecaptcha(key, action);
        const input = tokenRef.current;
        if (!input) throw new Error("recaptcha input missing");
        input.value = token;
        form.dataset.recaptchaReady = "1";

        const isStringAction = typeof formAction === "string" && formAction.length > 0;
        if (isStringAction) {
          // POST clássico: bypassa o handler React (evita loop / wipe do token).
          HTMLFormElement.prototype.submit.call(form);
          return;
        }
        form.requestSubmit();
      } catch {
        form.dataset.recaptchaReady = "0";
        onError?.(
          "Não foi possível concluir a verificação anti-bot. Recarregue a página e tente de novo.",
        );
      } finally {
        locking.current = false;
        setBusy(false);
      }
    },
    [action, armed, formAction, key, onError],
  );

  return (
    <form
      className={className}
      action={formAction}
      method={method}
      onSubmit={onSubmit}
    >
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
