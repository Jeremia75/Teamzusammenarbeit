"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Rücksprung nach der Anmeldung – nur Pfade innerhalb der App */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && /^\/(?![\/\\])/.test(n) ? n : "/";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === "login") {
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
          {mode === "login" ? "Melde dich an." : "Lege ein neues Konto an."}
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
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Passwort
          <input
            type="password"
            minLength={8}
            className="h-11 rounded-lg border border-(--c-line) px-3 font-normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold disabled:opacity-60"
        >
          {mode === "login" ? "Anmelden" : "Konto erstellen"}
        </button>

        {message && <p className="text-sm text-(--c-text-2)">{message}</p>}

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="text-sm text-(--c-accent) font-semibold min-h-11"
        >
          {mode === "login" ? "Noch kein Konto? Registrieren" : "Schon registriert? Anmelden"}
        </button>
      </form>
    </main>
  );
}
