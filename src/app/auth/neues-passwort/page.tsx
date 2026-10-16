"use client";

// Ziel des Links aus der Mail „Passwort vergessen“: Der Link hat schon angemeldet (siehe /auth/callback),
// hier wird nur noch das neue Passwort gesetzt.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setChecked(true);
    });
  }, [supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setMsg({ ok: false, text: "Die beiden Passwörter sind nicht gleich." });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      const same = /different from the old/i.test(error.message);
      const weak = /weak|pwned|leaked|known/i.test(error.message);
      return setMsg({
        ok: false,
        text: same
          ? "Das ist dein bisheriges Passwort. Bitte wähle ein neues."
          : weak
            ? "Dieses Passwort ist zu unsicher oder schon einmal im Internet aufgetaucht. Bitte wähle ein anderes."
            : "Nicht gespeichert: " + error.message,
      });
    }
    setMsg({ ok: true, text: "Gespeichert. Du wirst gleich weitergeleitet …" });
    setTimeout(() => router.replace("/"), 1200);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-(--c-bg) px-4">
      <div className="w-full max-w-sm bg-(--c-surface) border border-(--c-line) rounded-2xl p-8 flex flex-col gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Neues Passwort</h1>
        {!checked ? (
          <p className="text-sm text-(--c-muted)">Einen Moment …</p>
        ) : !email ? (
          <>
            <p className="text-sm text-(--c-text-2)">Der Link ist abgelaufen oder wurde schon benutzt. Fordere bitte auf der Anmeldeseite einen neuen an.</p>
            <Link href="/login" className="h-11 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold flex items-center justify-center">
              Zur Anmeldung
            </Link>
          </>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-4">
            <p className="text-sm text-(--c-muted)">
              Für <strong className="text-(--c-ink)">{email}</strong>. Mindestens 8 Zeichen.
            </p>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Neues Passwort
              <input
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="h-11 rounded-lg border border-(--c-line) px-3 font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Noch einmal
              <input
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                className="h-11 rounded-lg border border-(--c-line) px-3 font-normal"
              />
            </label>
            <button type="submit" disabled={busy} className="h-11 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold disabled:opacity-60">
              Passwort speichern
            </button>
          </form>
        )}
        {msg && (
          <p role="status" className={`text-sm font-semibold ${msg.ok ? "text-(--c-success-ink)" : "text-(--c-danger)"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </main>
  );
}
