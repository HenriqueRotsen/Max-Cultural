"use client";

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

async function loadScript(siteKey: string) {
  if (typeof window === "undefined") return;
  if (window.grecaptcha) {
    await new Promise<void>((resolve) => window.grecaptcha!.ready(() => resolve()));
    return;
  }
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load")), { once: true });
    });
    await new Promise<void>((resolve) => window.grecaptcha!.ready(() => resolve()));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("load"));
    document.head.appendChild(script);
  });
  await new Promise<void>((resolve) => window.grecaptcha!.ready(() => resolve()));
}

export async function executeRecaptcha(
  siteKey: string,
  action: RecaptchaAction,
): Promise<string> {
  if (!siteKey.trim()) return "";
  await loadScript(siteKey);
  const token = await window.grecaptcha!.execute(siteKey, { action });
  return token || "";
}
