import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ziel des Bestätigungslinks aus der Registrierungs-E-Mail
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const next = searchParams.get("next");
  return NextResponse.redirect(`${origin}${next && /^\/(?![\/\\])/.test(next) ? next : "/"}`);
}
