"use client";

// Verlauf einer Aufgabe: wer hat wann was geändert. Die Einträge schreibt die Datenbank selbst.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HistoryEntry, TaskPriority, TaskRecurrence, TaskStatus } from "@/lib/database.types";
import { formatDate, priorityOf, recurrenceLabel, statusOf } from "@/lib/labels";
import { Avatar } from "@/components/avatar";
import type { Member } from "@/components/project-view";

const q = (s: string | null) => `„${s ?? ""}“`;
const status = (s: string | null) => (s ? statusOf(s as TaskStatus)?.label ?? s : "");
const prio = (s: string | null) => (s ? priorityOf(s as TaskPriority)?.label ?? s : "");

function dateChange(what: string, o: string | null, n: string | null) {
  if (!o && n) return `hat ${what} auf ${formatDate(n)} gesetzt`;
  if (o && !n) return `hat ${what} entfernt (war ${formatDate(o)})`;
  return `hat ${what} von ${formatDate(o)} auf ${formatDate(n)} verschoben`;
}

/** Ein Eintrag als Satz ohne Namen, z. B. "hat den Status von Offen auf Erledigt geändert" */
export function describe(h: Pick<HistoryEntry, "field" | "old_value" | "new_value">): string {
  const { old_value: o, new_value: n } = h;
  switch (h.field) {
    case "created":
      return "hat die Aufgabe angelegt";
    case "title":
      return `hat den Titel geändert: ${q(o)} → ${q(n)}`;
    case "description":
      return "hat die Beschreibung geändert";
    case "status":
      return `hat den Status von ${status(o)} auf ${status(n)} geändert`;
    case "priority":
      return `hat die Priorität von ${prio(o)} auf ${prio(n)} geändert`;
    case "start_date":
      return dateChange("den Beginn", o, n);
    case "due_date":
      return dateChange("die Fälligkeit", o, n);
    case "section":
      return n ? `hat sie in die Rubrik ${q(n)} verschoben` : `hat sie aus der Rubrik ${q(o)} genommen`;
    case "milestone":
      return n ? `hat den Meilenstein ${q(n)} zugeordnet` : `hat den Meilenstein ${q(o)} entfernt`;
    case "recurrence":
      return n ? `hat die Wiederholung auf ${recurrenceLabel(n as TaskRecurrence)} gestellt` : "hat die Wiederholung beendet";
    case "project":
      return `hat sie vom Projekt ${q(o)} nach ${q(n)} verschoben`;
    case "trashed":
      return "hat sie in den Papierkorb gelegt";
    case "restored":
      return "hat sie aus dem Papierkorb wiederhergestellt";
    case "assignee_added":
      return `hat ${n} als verantwortlich eingetragen`;
    case "assignee_removed":
      return `hat ${n} als verantwortlich ausgetragen`;
    case "attachment_added":
      return o === "link" ? `hat den Link ${q(n)} hinzugefügt` : `hat die Datei ${q(n)} angehängt`;
    case "attachment_removed":
      return o === "link" ? `hat den Link ${q(n)} entfernt` : `hat die Datei ${q(n)} entfernt`;
    case "dependency_added":
      return `hat eingetragen: wartet auf ${q(n)}`;
    case "dependency_removed":
      return `hat „wartet auf ${n ?? ""}“ entfernt`;
    default:
      return "hat etwas geändert";
  }
}

/** Hin und zurück geändert (z. B. Status kurz umgestellt) – nicht anzeigen */
const VALUE_FIELDS = new Set(["title", "status", "priority", "start_date", "due_date", "section", "milestone", "recurrence"]);
const unchanged = (h: HistoryEntry) => VALUE_FIELDS.has(h.field) && (h.old_value ?? "") === (h.new_value ?? "");

export function when(iso: string, now = Date.now()) {
  const d = new Date(iso);
  const min = Math.round((now - d.getTime()) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  if (min < 6 * 60) return `vor ${Math.round(min / 60)} Std.`;
  const time = d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date(now)) - day(d)) / 86400000);
  if (diff === 0) return `heute, ${time}`;
  if (diff === 1) return `gestern, ${time}`;
  return `${d.toLocaleDateString("de-AT", { day: "numeric", month: "short", year: diff > 300 ? "numeric" : undefined })}, ${time}`;
}

export function TaskHistory({
  taskId,
  subtasks,
  members,
  currentUserId,
  version,
}: {
  taskId: string;
  subtasks: { id: string; title: string }[];
  members: Member[];
  currentUserId: string;
  /** Ändert sich, wenn an der Aufgabe etwas geändert wurde – dann neu laden */
  version: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [people, setPeople] = useState<Map<string, { name: string; color: string }>>(new Map());
  const [all, setAll] = useState(false);
  const subIds = subtasks.map((s) => s.id).join(",");

  useEffect(() => {
    if (!open) return;
    let off = false;
    // kurz warten, damit die gerade gespeicherte Änderung schon in der Datenbank ist
    const t = setTimeout(async () => {
      const ids = [taskId, ...(subIds ? subIds.split(",") : [])];
      const { data } = await supabase.from("task_history").select("*").in("task_id", ids).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(200);
      if (off || !data) return;
      setEntries(data);
      // Personen, die nicht (mehr) im Bereich sind, nachladen
      const known = new Set(members.map((m) => m.id));
      const missing = [...new Set(data.map((h) => h.actor_id).filter((x): x is string => !!x && !known.has(x)))];
      if (missing.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_color").in("id", missing);
        if (!off && profs) setPeople(new Map(profs.map((p) => [p.id, { name: p.display_name || "Ehemaliges Mitglied", color: p.avatar_color }])));
      }
    }, 500);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [open, version, taskId, subIds, supabase, members]);

  const byId = new Map(members.map((m) => [m.id, m]));
  const subTitle = new Map(subtasks.map((s) => [s.id, s.title]));
  const visible = (entries ?? []).filter((h) => !unchanged(h));
  const shown = all ? visible : visible.slice(0, 15);
  const now = Date.now();

  return (
    <details
      className="group border-t border-(--c-line-soft) pt-4"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="min-h-10 flex items-center gap-2 cursor-pointer select-none text-xs font-bold uppercase tracking-wider text-(--c-muted) hover:text-(--c-ink)">
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="transition-transform group-open:rotate-90">
          <path d="M9 6l6 6-6 6" />
        </svg>
        Verlauf
        <span className="font-semibold normal-case tracking-normal">– wer hat wann was geändert</span>
      </summary>
      <div className="pt-2">
        {entries === null ? (
          <p className="text-sm text-(--c-muted)">Lädt …</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-(--c-muted)">Noch keine Änderungen.</p>
        ) : (
          <ol aria-label="Verlauf" className="flex flex-col">
            {shown.map((h) => {
              const actor = h.actor_id ? (byId.get(h.actor_id) ?? people.get(h.actor_id) ?? { name: "Ehemaliges Mitglied", color: "#8A94A0" }) : null;
              const sub = h.task_id !== taskId ? subTitle.get(h.task_id) : undefined;
              const name = actor ? (h.actor_id === currentUserId ? "Du" : actor.name) : "Projektraum";
              let text = describe(h);
              if (h.actor_id === currentUserId) text = text.replace(/^hat /, "hast ");
              if (!actor) text = text.replace(/^hat /, "hat automatisch ");
              return (
                <li key={h.id} className="flex gap-2.5 py-1.5 border-b border-(--c-line-soft) last:border-b-0">
                  {actor ? (
                    <Avatar member={actor} size={22} />
                  ) : (
                    <span aria-hidden className="size-[22px] shrink-0 rounded-full bg-(--c-hover) text-(--c-muted) flex items-center justify-center text-[11px] font-bold">
                      P
                    </span>
                  )}
                  <div className="min-w-0 flex flex-col">
                    {sub && <span className="text-[11px] font-semibold text-(--c-muted) truncate">Unteraufgabe {q(sub)}</span>}
                    <span className="text-sm break-words">
                      <strong>{name}</strong> {sub && h.field === "created" ? text.replace("die Aufgabe", "die Unteraufgabe") : text}
                      {h.via_ai && <span className="text-(--c-muted)"> (über KI-Assistent)</span>}
                    </span>
                    <time dateTime={h.created_at} title={new Date(h.created_at).toLocaleString("de-AT")} className="text-xs text-(--c-muted)">
                      {when(h.created_at, now)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {!all && visible.length > shown.length && (
          <button type="button" onClick={() => setAll(true)} className="mt-1 min-h-10 text-sm font-semibold text-(--c-accent)">
            Alle {visible.length} Einträge zeigen
          </button>
        )}
      </div>
    </details>
  );
}
