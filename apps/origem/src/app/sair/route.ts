import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, PENDING_2FA_COOKIE, cookieDeleteOptions } from "@max/auth";
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
  try {
    const jar = await cookies();
    const opts = cookieDeleteOptions();
    jar.delete({ name: AUTH_COOKIE, ...opts });
    jar.delete({ name: PENDING_2FA_COOKIE, ...opts });
  } catch {
    // ignore
  }

  if (isAuthEnabled()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // SSO-only: pode não haver sessão Supabase local
    }
  }

  return NextResponse.redirect(origemHubLogoutUrl());
}
