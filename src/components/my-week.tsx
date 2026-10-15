"use client";

// "Meine Woche": alle eigenen Aufgaben über alle Projekte, nach Fälligkeit sortiert.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TaskPriority, TaskRecurrence, TaskStatus } from "@/lib/database.types";
import { statusOf } from "@/lib/labels";

export type WeekTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  project_id: string;
  project: string;
  color: string;
  parent: string | null;
  recurrence: TaskRecurrence | null;
};

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MON = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const label = (s: string) => {
  const d = parse(s);
  return `${WD[d.getDay()]} ${d.getDate()}. ${MON[d.getMonth()]}`;
};

type Bucket = { key: string; title: string; hint?: string; tasks: WeekTask[]; tone?: "danger" | "accent" };

export function MyWeek({ initial }: { initial: WeekTask[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setTasks(initial), [initial]);

  // Heute erst im Browser bestimmen (Zeitzone der Person)
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);

  const buckets = useMemo<Bucket[]>(() => {
    if (!today) return [];
    const t0 = iso(today);
    const t1 = iso(addDays(today, 1));
    const dow = (today.getDay() + 6) % 7; // 0 = Montag
    const sunday = iso(addDays(today, 6 - dow));
    const nextSunday = iso(addDays(today, 13 - dow));
    const open = tasks.filter((t) => t.status !== "done");
    // Laufende Aufgaben (Beginn erreicht, Fälligkeit später) zählen zu "Diese Woche", wenn sie jetzt dran sind
    const dueOf = (t: WeekTask) => t.due_date;
    const sort = (a: WeekTask, b: WeekTask) =>
      (dueOf(a) ?? "9999").localeCompare(dueOf(b) ?? "9999") || (a.priority === "high" ? -1 : 0) - (b.priority === "high" ? -1 : 0) || a.title.localeCompare(b.title, "de");
    const pick = (f: (t: WeekTask) => boolean) => open.filter(f).sort(sort);
    return [
      { key: "overdue", title: "Überfällig", tasks: pick((t) => !!t.due_date && t.due_date < t0), tone: "danger" as const },
      { key: "today", title: "Heute", hint: label(t0), tasks: pick((t) => t.due_date === t0), tone: "accent" as const },
      { key: "tomorrow", title: "Morgen", hint: label(t1), tasks: pick((t) => t.due_date === t1) },
      { key: "week", title: "Diese Woche", hint: `bis ${label(sunday)}`, tasks: pick((t) => !!t.due_date && t.due_date > t1 && t.due_date <= sunday) },
      { key: "next", title: "Nächste Woche", tasks: pick((t) => !!t.due_date && t.due_date > sunday && t.due_date <= nextSunday) },
      { key: "later", title: "Später", tasks: pick((t) => !!t.due_date && t.due_date > nextSunday) },
      { key: "none", title: "Ohne Termin", tasks: pick((t) => !t.due_date) },
    ];
  }, [tasks, today]);

  const done = tasks.filter((t) => t.status === "done");
  const count = (k: string) => buckets.find((b) => b.key === k)?.tasks.length ?? 0;

  async function toggle(t: WeekTask) {
    const next: TaskStatus = t.status === "done" ? "todo" : "done";
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    const { error } = await supabase.from("tasks").update({ status: next }).eq("id", t.id);
    if (error) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
      return setError("Nicht gespeichert: " + error.message);
    }
    // Wiederkehrende Aufgabe: die nächste Runde vom Server holen
    if (next === "done" && t.recurrence) router.refresh();
  }

  if (!today) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-7 py-8 flex flex-col gap-6">
      <header data-panel className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Meine Woche</h1>
        <p className="text-(--c-text-2)">
          Alles, wofür du verantwortlich bist – aus allen Projekten.{" "}
          {count("overdue") > 0 && <strong className="text-(--c-danger)">{count("overdue")} überfällig. </strong>}
          {count("today") > 0 ? `${count("today")} heute fällig.` : "Heute ist nichts fällig."}
        </p>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg bg-(--c-danger-soft) text-(--c-danger) px-4 py-3 text-sm font-semibold">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto underline min-h-11">
            Schließen
          </button>
        </div>
      )}

      {buckets.every((b) => b.tasks.length === 0) && (
        <section data-panel className="rounded-xl border border-(--c-line) bg-(--c-surface) p-6 text-center flex flex-col gap-2">
          <p className="text-lg font-bold">Alles erledigt</p>
          <p className="text-sm text-(--c-text-2)">Du hast gerade keine offenen Aufgaben. Neue Aufgaben, die dir jemand zuteilt, erscheinen hier.</p>
        </section>
      )}

      {buckets
        .filter((b) => b.tasks.length > 0)
        .map((b) => (
          <section key={b.key} data-panel aria-label={b.title} className="flex flex-col gap-2">
            <h2 className={`flex items-baseline gap-2 text-sm font-extrabold uppercase tracking-wider ${b.tone === "danger" ? "text-(--c-danger)" : b.tone === "accent" ? "text-(--c-accent)" : "text-(--c-muted)"}`}>
              {b.title}
              <span className="font-semibold normal-case tracking-normal text-(--c-muted)">
                {b.tasks.length}
                {b.hint ? ` · ${b.hint}` : ""}
              </span>
            </h2>
            <ul className="rounded-xl border border-(--c-line) bg-(--c-surface) divide-y divide-(--c-line-soft)">
              {b.tasks.map((t) => (
                <Row key={t.id} t={t} onToggle={() => toggle(t)} showDate={b.key !== "today" && b.key !== "tomorrow" && b.key !== "none"} overdue={b.key === "overdue"} />
              ))}
            </ul>
          </section>
        ))}

      {done.length > 0 && (
        <details data-panel className="rounded-xl border border-(--c-line) bg-(--c-surface) px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold min-h-9 flex items-center">Zuletzt erledigt ({done.length})</summary>
          <ul className="divide-y divide-(--c-line-soft) mt-2">
            {done.map((t) => (
              <Row key={t.id} t={t} onToggle={() => toggle(t)} showDate={false} overdue={false} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({ t, onToggle, showDate, overdue }: { t: WeekTask; onToggle: () => void; showDate: boolean; overdue: boolean }) {
  const done = t.status === "done";
  const st = statusOf(t.status);
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `${t.title} wieder öffnen` : `${t.title} als erledigt markieren`}
        className={`mt-0.5 size-6 shrink-0 rounded-full border-2 flex items-center justify-center ${done ? "bg-(--st-done) border-(--st-done) text-white" : "border-(--c-line) hover:border-(--st-done)"}`}
      >
        {done && (
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <Link href={`/p/${t.project_id}?aufgabe=${t.id}`} className={`font-semibold leading-snug hover:underline underline-offset-4 ${done ? "line-through text-(--c-muted)" : ""}`}>
          {t.title}
        </Link>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-(--c-text-2)">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-sm" style={{ background: t.color }} />
            {t.project}
          </span>
          {t.parent && <span className="text-(--c-muted)">in „{t.parent}“</span>}
          {(t.status === "doing" || t.status === "review") && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: st.color }} />
              {st.label}
            </span>
          )}
          {t.recurrence && <span title="Wiederkehrend">↻</span>}
        </span>
      </div>
      <span className="flex flex-col items-end gap-1 shrink-0 text-xs">
        {showDate && t.due_date && <span className={`font-semibold ${overdue ? "text-(--c-danger)" : "text-(--c-text-2)"}`}>{label(t.due_date)}</span>}
        {t.priority === "high" && !done && <span className="rounded px-1.5 py-0.5 font-bold bg-(--prio-high-bg) text-(--prio-high-fg)">Hoch</span>}
      </span>
    </li>
  );
}
