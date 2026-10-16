"use client";

// Eigene Erinnerung an eine Aufgabe (nur für mich). Der Dienst "benachrichtigungen"
// schickt sie zur eingestellten Zeit per E-Mail und zeigt sie in der Glocke.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = { id: number; remind_at: string; sent_at: string | null };

const pad = (n: number) => String(n).padStart(2, "0");
/** Date → Wert für <input type="datetime-local"> (Ortszeit) */
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "Fr., 17. Okt., 08:00" bzw. "heute, 17:00" / "morgen, 08:00" */
export function formatWhen(iso: string, now = new Date()) {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  const time = d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `heute, ${time}`;
  if (diff === 1) return `morgen, ${time}`;
  return `${d.toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

function at(base: Date, days: number, hour: number) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, hour, 0, 0, 0);
  return d;
}

/** Vorschläge je nach Uhrzeit und Fälligkeit */
export function suggestions(now: Date, dueDate: string | null): { key: string; label: string; date: Date }[] {
  const list: { key: string; label: string; date: Date }[] = [];
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  inHour.setSeconds(0, 0);
  list.push({ key: "1h", label: "In 1 Stunde", date: inHour });
  if (now.getHours() < 16) list.push({ key: "today17", label: "Heute 17:00", date: at(now, 0, 17) });
  list.push({ key: "tomorrow8", label: "Morgen 8:00", date: at(now, 1, 8) });
  if (dueDate) {
    const [y, m, d] = dueDate.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const before = at(due, -1, 8);
    const onDay = at(due, 0, 8);
    if (before > now && before.getTime() !== at(now, 1, 8).getTime()) list.push({ key: "before", label: "1 Tag vor Fälligkeit, 8:00", date: before });
    if (onDay > now && onDay.getTime() !== at(now, 1, 8).getTime()) list.push({ key: "due", label: "Am Fälligkeitstag, 8:00", date: onDay });
  }
  return list;
}

export function TaskReminder({ taskId, userId, dueDate }: { taskId: string; userId: string; dueDate: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [row, setRow] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("task_reminders")
      .select("id, remind_at, sent_at")
      .eq("task_id", taskId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setRow(data);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [supabase, taskId, userId]);

  async function save(date: Date) {
    if (date.getTime() < Date.now() - 60 * 1000) return setMsg("Diese Zeit ist schon vorbei.");
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase
      .from("task_reminders")
      .upsert({ task_id: taskId, user_id: userId, remind_at: date.toISOString() }, { onConflict: "task_id,user_id" })
      .select("id, remind_at, sent_at")
      .single();
    setBusy(false);
    if (error) return setMsg("Erinnerung nicht gespeichert: " + error.message);
    setRow(data);
    setEditing(false);
    setCustom("");
  }

  async function remove() {
    if (!row) return;
    setBusy(true);
    const { error } = await supabase.from("task_reminders").delete().eq("id", row.id);
    setBusy(false);
    if (error) return setMsg("Nicht entfernt: " + error.message);
    setRow(null);
    setEditing(false);
  }

  if (!loaded) return null;
  const now = new Date();
  const pending = row && !row.sent_at;
  const chip =
    "min-h-10 px-3 rounded-full border border-(--c-line) bg-(--c-surface) text-sm font-semibold hover:bg-(--c-hover) disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2" data-reminder>
      <span className="text-xs font-bold uppercase tracking-wide text-(--c-muted)">Erinnerung</span>

      {pending && !editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-(--c-accent-line-2) bg-(--c-accent-soft) px-3 py-2">
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-(--c-accent-ink)">
            <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
            <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
          </svg>
          <span className="flex-1 text-sm font-semibold text-(--c-accent-ink)">{formatWhen(row.remind_at, now)}</span>
          <button type="button" onClick={() => setEditing(true)} className="min-h-9 px-2 text-sm font-semibold underline underline-offset-4">
            Ändern
          </button>
          <button type="button" disabled={busy} onClick={remove} className="min-h-9 px-2 text-sm font-semibold text-(--c-danger) underline underline-offset-4">
            Entfernen
          </button>
        </div>
      )}

      {!pending && !editing && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setEditing(true)} className={`${chip} inline-flex items-center gap-2 self-start`}>
            <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
              <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
            </svg>
            Erinnere mich …
          </button>
          {row?.sent_at && <span className="text-sm text-(--c-muted)">Zuletzt erinnert: {formatWhen(row.remind_at, now)}</span>}
        </div>
      )}

      {editing && (
        <>
          <div className="flex flex-wrap gap-2">
            {suggestions(now, dueDate).map((s) => (
              <button key={s.key} type="button" disabled={busy} onClick={() => save(s.date)} className={chip}>
                {s.label}
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom) save(new Date(custom));
            }}
          >
            <label htmlFor={`rem-${taskId}`} className="text-sm text-(--c-text-2)">
              Oder:
            </label>
            <input
              id={`rem-${taskId}`}
              type="datetime-local"
              value={custom}
              min={toLocalInput(now)}
              onChange={(e) => setCustom(e.target.value)}
              className="min-h-10 rounded-lg border border-(--c-line) bg-(--c-surface) px-2 text-sm"
            />
            <button type="submit" disabled={!custom || busy} className="min-h-10 px-3 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-40">
              Erinnern
            </button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-10 px-2 text-sm font-semibold underline underline-offset-4">
              Abbrechen
            </button>
          </form>
          <p className="text-xs text-(--c-muted)">Nur für dich: Du bekommst eine E-Mail und einen Hinweis in der Glocke.</p>
        </>
      )}
      {msg && (
        <p role="alert" className="text-sm text-(--c-danger)">
          {msg}
        </p>
      )}
    </div>
  );
}
