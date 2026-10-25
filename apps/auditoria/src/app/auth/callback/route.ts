import { NextResponse } from "next/server";
import { culturalHubUrl } from "@max/auth";

/** Links de auth antigos (Supabase) → hub MAX Cultural. */
export async function GET() {
  return NextResponse.redirect(`${culturalHubUrl()}/login`);
}
