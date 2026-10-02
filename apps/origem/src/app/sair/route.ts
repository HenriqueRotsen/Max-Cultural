import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  clearAuthCookieOptions,
} from "@max/auth";
import { isAuthEnabled } from "@/lib/auth/config";
import { origemHubLogoutUrl } from "@/lib/auth/hub";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Logout do Origem: limpa cookie SSO + Supabase e manda ao /logout do Cultural.
 * Route Handler evita falha de Server Action no redirect cross-origin (#441).
 */
export async function GET() {
  if (isAuthEnabled()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // SSO-only: pode não haver sessão Supabase local
    }
  }

  const res = NextResponse.redirect(origemHubLogoutUrl());
  for (const opts of clearAuthCookieOptions()) {
    res.cookies.set(AUTH_COOKIE, "", opts);
    res.cookies.set(PENDING_2FA_COOKIE, "", opts);
  }
  return res;
}
