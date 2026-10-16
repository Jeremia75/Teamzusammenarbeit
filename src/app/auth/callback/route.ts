import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ziel der Links aus den Mails von Supabase (Registrierung bestätigen, Passwort vergessen)
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const next = searchParams.get("next");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Abgelaufener oder schon benutzter Link (z. B. Passwort vergessen): zurück zur Anmeldung mit Hinweis
    if (error) return NextResponse.redirect(`${origin}/login?fehler=link`);
  } else if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?fehler=link`);
  }
  return NextResponse.redirect(`${origin}${next && /^\/(?![\/\\])/.test(next) ? next : "/"}`);
}
