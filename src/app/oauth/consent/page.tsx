"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Details = { authorization_id: string; redirect_uri: string; client: { name: string; uri: string }; user: { email: string } };

// Freigabe-Seite: Eine KI-App (z. B. Claude) möchte im Namen der Person auf Projektraum zugreifen.
export default function ConsentPage() {
  const supabase = useMemo(() => createClient(), []);
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const authId = new URLSearchParams(window.location.search).get("authorization_id");
    setId(authId);
    if (!authId) return setError("Diese Seite wurde ohne Anfrage geöffnet. Starte die Verbindung bitte in der KI-App neu.");
    supabase.auth.oauth.getAuthorizationDetails(authId).then(({ data, error }) => {
      if (error || !data) return setError("Die Anfrage ist abgelaufen oder ungültig. Starte die Verbindung bitte in der KI-App neu.");
      if ("redirect_url" in data && !("authorization_id" in data)) {
        window.location.href = data.redirect_url; // schon früher erlaubt
        return;
      }
      setDetails(data as unknown as Details);
    });
  }, [supabase]);

  async function decide(allow: boolean) {
    if (!id) return;
    setBusy(allow ? "allow" : "deny");
    const { data, error } = allow
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
    if (error || !data) {
      setBusy(null);
      return setError("Das hat nicht geklappt: " + (error?.message ?? "unbekannter Fehler"));
    }
    window.location.href = data.redirect_url;
  }

  const host = (() => {
    try {
      return details ? new URL(details.redirect_uri).hostname : "";
    } catch {
      return "";
    }
  })();

  return (
    <main className="min-h-screen flex items-center justify-center bg-(--c-bg) px-4 py-10">
      <section aria-labelledby="t" className="w-full max-w-md bg-(--c-surface) border border-(--c-line) rounded-2xl p-7 flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="size-9 rounded-lg bg-(--c-ink) text-(--c-on-ink) flex items-center justify-center font-extrabold">P</span>
          <span className="font-extrabold text-lg">Projektraum</span>
        </div>

        {error ? (
          <>
            <h1 id="t" className="text-xl font-extrabold">Verbindung nicht möglich</h1>
            <p role="alert" className="text-sm text-(--c-text-2)">{error}</p>
            <Link href="/" className="min-h-11 inline-flex items-center justify-center rounded-lg border border-(--c-line) font-bold text-sm">
              Zu Projektraum
            </Link>
          </>
        ) : !details ? (
          <p id="t" className="text-sm text-(--c-muted)">Einen Moment …</p>
        ) : (
          <>
            <h1 id="t" className="text-xl font-extrabold leading-snug">
              <span className="text-(--c-accent)">{details.client.name || host || "Eine App"}</span> möchte auf deinen Projektraum zugreifen
            </h1>
            <div className="text-sm text-(--c-text-2) flex flex-col gap-2">
              <p>Wenn du erlaubst, kann die App in deinem Namen:</p>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                <li>deine Bereiche, Projekte und Aufgaben lesen,</li>
                <li>neue Aufgaben und Projekte anlegen,</li>
                <li>Aufgaben ändern, abhaken, kommentieren und Links anhängen.</li>
              </ul>
              <p>
                <strong>Löschen kann sie nichts.</strong> Sie sieht nur, was du auch in der App siehst. Du kannst den Zugriff jederzeit unter{" "}
                <em>KI-Assistent</em> in der Seitenleiste wieder entziehen.
              </p>
            </div>
            <dl className="text-sm rounded-xl bg-(--c-bg) border border-(--c-line-soft) p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-(--c-muted)">Angemeldet als</dt>
              <dd className="font-semibold break-all">{details.user.email}</dd>
              {host && (
                <>
                  <dt className="text-(--c-muted)">Weiter zu</dt>
                  <dd className="font-semibold break-all">{host}</dd>
                </>
              )}
            </dl>
            <p className="text-xs text-(--c-muted)">Erlaube das nur, wenn du die Verbindung gerade selbst gestartet hast.</p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => decide(false)}
                className="min-h-11 flex-1 rounded-lg border border-(--c-line) font-bold text-sm disabled:opacity-60"
              >
                {busy === "deny" ? "…" : "Ablehnen"}
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => decide(true)}
                className="min-h-11 flex-1 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold text-sm disabled:opacity-60"
              >
                {busy === "allow" ? "Einen Moment …" : "Erlauben"}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
