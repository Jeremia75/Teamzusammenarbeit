"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Rücksprung nach der Anmeldung – nur Pfade innerhalb der App */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && /^\/(?![\/\\])/.test(n) ? n : "/";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Link aus einer Einladung: /login?modus=registrieren&email=…
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const mail = q.get("email");
    if (mail) setEmail(mail);
    if (q.get("modus") === "registrieren") setMode("signup");
    if (q.get("fehler") === "link") setMessage("Der Link ist abgelaufen oder wurde schon benutzt. Fordere bitte einen neuen an.");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/neues-passwort`,
      });
      // Immer die gleiche Antwort – so lässt sich nicht herausfinden, welche Adressen registriert sind
      setMessage(
        error && /rate|security purposes/i.test(error.message)
          ? "Bitte warte kurz, bevor du noch einen Link anforderst."
          : `Wenn ${email} bei Projektraum registriert ist, kommt gleich eine E-Mail mit einem Link. Schau auch im Spam-Ordner nach.`,
      );
    } else if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage("Anmeldung fehlgeschlagen: " + error.message);
      else router.replace(nextPath());
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback${nextPath() !== "/" ? "?next=" + encodeURIComponent(nextPath()) : ""}`,
        },
      });
      setMessage(
        error
          ? "Registrierung fehlgeschlagen: " + error.message
          : "Fast geschafft: Bitte bestätige den Link in deiner E-Mail.",
      );
    }
    setBusy(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-(--c-bg) px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-(--c-surface) border border-(--c-line) rounded-2xl p-8 flex flex-col gap-4"
      >
        <h1 className="text-2xl font-extrabold tracking-tight">Projektraum</h1>
        <p className="text-sm text-(--c-muted)">
          {mode === "login"
            ? "Melde dich an."
            : mode === "signup"
              ? "Lege ein neues Konto an."
              : "Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst."}
        </p>

        {mode === "signup" && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Name
            <input
              className="h-11 rounded-lg border border-(--c-line) px-3 font-normal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-semibold">
          E-Mail
          <input
            type="email"
            className="h-11 rounded-lg border border-(--c-line) px-3 font-normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        {mode !== "reset" && (
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Passwort
              <input
                type="password"
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="h-11 rounded-lg border border-(--c-line) px-3 font-normal"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setMessage(null);
                }}
                className="self-end text-sm font-semibold text-(--c-accent) min-h-9"
              >
                Passwort vergessen?
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold disabled:opacity-60"
        >
          {mode === "login" ? "Anmelden" : mode === "signup" ? "Konto erstellen" : "Link schicken"}
        </button>

        {message && (
          <p role="status" className="text-sm text-(--c-text-2)">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage(null);
          }}
          className="text-sm text-(--c-accent) font-semibold min-h-11"
        >
          {mode === "login" ? "Noch kein Konto? Registrieren" : mode === "signup" ? "Schon registriert? Anmelden" : "Zurück zur Anmeldung"}
        </button>
        <p className="text-xs text-(--c-muted) text-center">
          <Link href="/impressum" className="underline underline-offset-2">Impressum</Link>
          {" · "}
          <Link href="/datenschutz" className="underline underline-offset-2">Datenschutz</Link>
        </p>
      </form>
    </main>
  );
}
