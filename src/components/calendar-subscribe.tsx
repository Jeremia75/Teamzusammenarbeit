"use client";

// Kalender abonnieren: persönlicher Link für Outlook, Google Kalender oder das Handy.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CopyField } from "@/components/copy-field";

export function CalendarSubscribe() {
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"renew" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("calendar_tokens")
      .select("token")
      .maybeSingle()
      .then(({ data }) => setToken(data?.token ?? null));
  }, [supabase]);

  async function create() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.from("calendar_tokens").insert({}).select("token").single();
    setBusy(false);
    if (error) return setError("Konnte den Link nicht erstellen: " + error.message);
    setToken(data.token);
  }
  async function stop(renew: boolean) {
    setBusy(true);
    setError(null);
    const { data: me } = await supabase.auth.getUser();
    const { error } = await supabase.from("calendar_tokens").delete().eq("user_id", me.user?.id ?? "");
    setConfirm(null);
    if (error) {
      setBusy(false);
      return setError("Das hat nicht geklappt: " + error.message);
    }
    setToken(null);
    setBusy(false);
    if (renew) await create();
  }

  const url = token && typeof window !== "undefined" ? `${window.location.origin}/api/kalender/${token}.ics` : "";
  const webcal = url.replace(/^https?:/, "webcal:");
  const btn = "inline-flex items-center min-h-10 px-3.5 rounded-lg border border-(--c-line) text-sm font-semibold hover:bg-(--c-hover)";

  return (
    <section aria-labelledby="cal-h" className="bg-(--c-surface) border border-(--c-line) rounded-xl p-5 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="cal-h" className="text-lg font-extrabold">Termine im Kalender</h2>
        <p className="text-sm text-(--c-text-2)">
          Deine Aufgaben mit Datum und die Meilensteine deiner Projekte erscheinen in deinem Kalender – in Outlook, Google Kalender oder am Handy.
          Der Kalender aktualisiert sich von selbst, meist innerhalb von ein paar Stunden.
        </p>
      </div>

      {token === undefined ? (
        <p className="text-sm text-(--c-muted)">Einen Moment …</p>
      ) : token === null ? (
        <div>
          <button type="button" disabled={busy} onClick={create} className="min-h-11 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60">
            Kalender-Link erstellen
          </button>
        </div>
      ) : (
        <>
          <div className="text-sm">
            <span className="font-semibold">Dein persönlicher Link</span>
            <CopyField value={url} label="Kalender-Link" />
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={webcal} className={btn}>
              In Outlook oder Apple Kalender öffnen
            </a>
            <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer" className={btn}>
              In Google Kalender hinzufügen
            </a>
          </div>
          <details className="text-sm text-(--c-text-2)">
            <summary className="cursor-pointer font-semibold text-(--c-ink) min-h-9 flex items-center">So geht&apos;s von Hand</summary>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 mt-1">
              <li>
                <strong>Outlook (Windows oder im Browser):</strong> Kalender öffnen → <em>Kalender hinzufügen</em> → <em>Aus dem Internet abonnieren</em> → Link
                einfügen.
              </li>
              <li>
                <strong>Google Kalender:</strong> links bei <em>Weitere Kalender</em> auf + → <em>Per URL</em> → Link einfügen.
              </li>
              <li>
                <strong>iPhone:</strong> Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → <em>Kalenderabo hinzufügen</em>.
              </li>
            </ul>
          </details>
          <p className="text-xs text-(--c-muted)">
            Wer diesen Link kennt, sieht deine Termine. Gib ihn nicht weiter. Hast du ihn aus Versehen geteilt, erneuere ihn – der alte funktioniert dann nicht
            mehr.
          </p>
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">
                {confirm === "renew" ? "Neuen Link erstellen? Der alte hört auf zu funktionieren." : "Kalender-Abo beenden? Der Link hört auf zu funktionieren."}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => stop(confirm === "renew")}
                className="min-h-10 px-3.5 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60"
              >
                {confirm === "renew" ? "Erneuern" : "Beenden"}
              </button>
              <button type="button" onClick={() => setConfirm(null)} className={btn}>
                Abbrechen
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setConfirm("renew")} className={btn}>
                Link erneuern
              </button>
              <button type="button" onClick={() => setConfirm("stop")} className={btn}>
                Abo beenden
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-(--c-danger)">
          {error}
        </p>
      )}
    </section>
  );
}
