"use client";

import { useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NotificationSettings } from "@/lib/database.types";

type Mode = NotificationSettings["daily_mode"];

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "digest", label: "Jeden Morgen einen Überblick", hint: "Um 7 Uhr: was überfällig ist, was heute und in den nächsten Tagen fällig ist." },
  { id: "due", label: "Nur kurz vor einem Termin", hint: "Am Tag vorher und am Tag selbst, aber nur wenn wirklich etwas fällig ist." },
  { id: "off", label: "Keine regelmäßige E-Mail", hint: "" },
];

/** Auswahl der E-Mail-Benachrichtigungen – im Abfrage-Dialog und auf der Einstellungsseite. */
export function NotificationForm({
  userId,
  email,
  initial,
  submitLabel = "Speichern",
  onSaved,
  secondary,
}: {
  userId: string;
  email: string;
  initial: Pick<NotificationSettings, "email_enabled" | "daily_mode" | "on_assigned"> & { weekly_review?: boolean; on_mention?: boolean } | null;
  submitLabel?: string;
  onSaved?: () => void;
  secondary?: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const id = useId();
  const [enabled, setEnabled] = useState<boolean | null>(initial ? initial.email_enabled : null);
  const [mode, setMode] = useState<Mode>(initial && initial.daily_mode !== "off" ? initial.daily_mode : initial ? "off" : "due");
  const [assigned, setAssigned] = useState(initial ? initial.on_assigned : true);
  const [weekly, setWeekly] = useState(initial ? !!initial.weekly_review : false);
  const [mentioned, setMentioned] = useState(initial ? initial.on_mention !== false : true);
  const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (enabled === null) return setState({ ok: false, msg: "Bitte wähle Ja oder Nein." });
    setBusy(true);
    const on = enabled && (mode !== "off" || assigned || weekly || mentioned);
    const { error } = await supabase.from("notification_settings").upsert({
      user_id: userId,
      email_enabled: on,
      daily_mode: enabled ? mode : "off",
      on_assigned: enabled ? assigned : false,
      weekly_review: enabled ? weekly : false,
      on_mention: enabled ? mentioned : false,
      asked_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) return setState({ ok: false, msg: "Nicht gespeichert: " + error.message });
    setState({ ok: true, msg: on ? `Gespeichert. Die E-Mails gehen an ${email}.` : "Gespeichert. Du bekommst keine E-Mails." });
    onSaved?.();
  }

  const radio = "mt-0.5 size-[18px] accent-(--c-accent) shrink-0";
  const option = "flex items-start gap-3 rounded-lg border px-3.5 py-3 cursor-pointer";

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-bold mb-2">Möchtest du per E-Mail an deine Aufgaben erinnert werden?</legend>
        <div className="flex flex-wrap gap-2">
          {[
            [true, "Ja, gerne"],
            [false, "Nein, danke"],
          ].map(([v, label]) => (
            <label
              key={String(v)}
              className={`${option} flex-[1_1_160px] items-center ${enabled === v ? "border-(--c-accent) bg-(--c-accent-soft)" : "border-(--c-line) bg-(--c-surface)"}`}
            >
              <input type="radio" name={`${id}-on`} checked={enabled === v} onChange={() => setEnabled(v as boolean)} className={radio} />
              <span className="font-semibold">{label as string}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {enabled && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="font-bold mb-2">Wann sollen wir dir schreiben?</legend>
            {MODES.map((m) => (
              <label key={m.id} className={`${option} ${mode === m.id ? "border-(--c-accent) bg-(--c-accent-soft)" : "border-(--c-line) bg-(--c-surface)"}`}>
                <input type="radio" name={`${id}-mode`} checked={mode === m.id} onChange={() => setMode(m.id)} className={radio} />
                <span className="flex flex-col">
                  <span className="font-semibold">{m.label}</span>
                  {m.hint && <span className="text-sm text-(--c-muted)">{m.hint}</span>}
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-bold mb-2">Sofort, wenn es dich betrifft</legend>
            <label className={`${option} ${assigned ? "border-(--c-accent) bg-(--c-accent-soft)" : "border-(--c-line) bg-(--c-surface)"}`}>
              <input type="checkbox" checked={assigned} onChange={(e) => setAssigned(e.target.checked)} className={radio} />
              <span className="flex flex-col">
                <span className="font-semibold">E-Mail, wenn mir jemand eine Aufgabe zuordnet</span>
                <span className="text-sm text-(--c-muted)">Kommt gleich, wenige Minuten nach der Zuordnung. Wenn du dich selbst einträgst, kommt keine.</span>
              </span>
            </label>
            <label className={`${option} ${mentioned ? "border-(--c-accent) bg-(--c-accent-soft)" : "border-(--c-line) bg-(--c-surface)"}`}>
              <input type="checkbox" checked={mentioned} onChange={(e) => setMentioned(e.target.checked)} className={radio} />
              <span className="flex flex-col">
                <span className="font-semibold">E-Mail, wenn mich jemand mit @ erwähnt</span>
                <span className="text-sm text-(--c-muted)">
                  Mit dem Kommentar und einem Link zum Antworten. Kommt nur, wenn du die Mitteilung nicht schon in Projektraum gelesen hast.
                </span>
              </span>
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-bold mb-2">Wochenrückblick</legend>
            <label className={`${option} ${weekly ? "border-(--c-accent) bg-(--c-accent-soft)" : "border-(--c-line) bg-(--c-surface)"}`}>
              <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} className={radio} />
              <span className="flex flex-col">
                <span className="font-semibold">Jeden Montag einen Rückblick auf die letzte Woche</span>
                <span className="text-sm text-(--c-muted)">
                  Um 7 Uhr: was du erledigt hast, was überfällig ist, was diese Woche ansteht und was im Team weitergegangen ist.
                </span>
              </span>
            </label>
          </fieldset>

          <p className="text-sm text-(--c-muted)">
            Die E-Mails gehen an <strong className="text-(--c-ink)">{email}</strong>.
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="h-11 px-5 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold disabled:opacity-60">
          {submitLabel}
        </button>
        {secondary}
      </div>
      {state && (
        <p role="status" className={`text-sm font-semibold ${state.ok ? "text-(--c-success-ink)" : "text-(--c-danger)"}`}>
          {state.msg}
        </p>
      )}
    </form>
  );
}
