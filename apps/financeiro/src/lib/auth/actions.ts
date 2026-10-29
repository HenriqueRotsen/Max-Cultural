"use server";

import { redirect } from "next/navigation";
import { culturalHubUrl } from "@max/auth";
import { isAuthEnabled } from "@/lib/auth/config";
import { financeiroHubLoginUrl, financeiroHubLogoutUrl } from "@/lib/auth/hub";
import { createClient } from "@/lib/supabase/server";

export async function signIn() {
  redirect(financeiroHubLoginUrl("/painel"));
}

export async function signOut() {
  if (isAuthEnabled()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // Hub SSO manda; limpeza local do Supabase é best-effort.
    }
  }
  redirect(financeiroHubLogoutUrl());
}

/** Auth/senha só no MAX Cultural — o Financeiro não envia e-mail de conta. */
export async function requestPasswordReset() {
  redirect(`${culturalHubUrl()}/login/recuperar`);
}

/** Auth/senha só no MAX Cultural. */
export async function updatePassword() {
  redirect(financeiroHubLoginUrl("/painel"));
}
