import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Troca o `code` do e-mail de recuperação pela sessão e redireciona. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") || "/redefinir-senha";
  const next = nextRaw.startsWith("/") ? nextRaw : "/redefinir-senha";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/recuperar-senha?error=${encodeURIComponent("Link inválido ou expirado")}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
