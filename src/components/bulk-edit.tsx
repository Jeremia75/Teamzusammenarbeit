"use client";

// Mehrere Aufgaben auf einmal bearbeiten: Auswahl merken, Leiste unten mit Aktionen.
// Auswählen: Knopf „Auswählen“ in der Ansicht, oder Strg/⌘/Umschalt + Klick auf eine Karte,
// in der Liste über die Kästchen. Esc hebt die Auswahl auf.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Milestone, Section, Task, TaskPriority, TaskStatus } from "@/lib/database.types";
import { PRIORITIES, STATUSES, formatDate } from "@/lib/labels";
import { short } from "@/components/undo";
import type { Assignee, Member } from "@/components/project-view";

export type Selection = {
  ids: Set<string>;
  /** Auswahlmodus an: ein Klick auf eine Karte wählt sie aus, statt sie zu öffnen */
  active: boolean;
  setActive: (on: boolean) => void;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
};

export function useSelection(validIds: string[]): Selection {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [active, setActiveState] = useState(false);

  // Aufgaben, die es nicht mehr gibt (gelöscht, ausgeblendet), fallen aus der Auswahl
  const key = validIds.join(",");
  useEffect(() => {
    const valid = new Set(key ? key.split(",") : []);
    setIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [key]);

  const clear = useCallback(() => {
    setIds(new Set());
    setActiveState(false);
  }, []);
  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setMany = useCallback((list: string[], on: boolean) => {
    setIds((prev) => {
      const next = new Set(prev);
      list.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);
  const setActive = useCallback((on: boolean) => {
    setActiveState(on);
    if (!on) setIds(new Set());
  }, []);

  // Esc: Auswahl aufheben (nicht, wenn ein Fenster offen ist oder in ein Feld geschrieben wird)
  const any = active || ids.size > 0;
  useEffect(() => {
    if (!any) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [any, clear]);

  // Leiste ist sichtbar: Rückgängig-Meldung rutscht darüber (siehe undo.tsx)
  const show = ids.size > 0 || active;
  useEffect(() => {
    if (!show) return;
    document.body.dataset.bulk = "1";
    return () => {
      delete document.body.dataset.bulk;
    };
  }, [show]);

  return { ids, active, setActive, toggle, setMany, clear };
}

/** Klick auf eine Karte: im Auswahlmodus oder mit Strg/⌘/Umschalt auswählen, sonst öffnen */
export function clickPicks(sel: Selection | undefined, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
  return !!sel && (sel.active || sel.ids.size > 0 || e.ctrlKey || e.metaKey || e.shiftKey);
}

type BulkDeps = {
  supabase: SupabaseClient<Database>;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  assignees: Assignee[];
  setAssignees: React.Dispatch<React.SetStateAction<Assignee[]>>;
  offerUndo: (text: string, undo: () => void | Promise<void>) => void;
  fail: (msg: string) => void;
  reload: () => void | Promise<void>;
};

const n = (k: number) => (k === 1 ? "1 Aufgabe" : `${k} Aufgaben`);

/** Die eigentlichen Änderungen – mit „Rückgängig“ */
export function useBulkActions(d: BulkDeps) {
  const { supabase, tasks, setTasks, assignees, setAssignees, offerUndo, fail, reload } = d;

  const patch = useCallback(
    async (ids: string[], p: Partial<Task>, label: string) => {
      const before = tasks.filter((t) => ids.includes(t.id));
      if (!before.length) return;
      const keys = Object.keys(p) as (keyof Task)[];
      setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, ...p } : t)));
      const { error } = await supabase.from("tasks").update(p).in("id", ids);
      if (error) return fail("Änderung nicht gespeichert: " + error.message);
      // Erledigt bei wiederkehrenden Aufgaben: die Datenbank legt die nächsten an – kein Rückgängig
      const spawns = p.status === "done" && before.some((t) => t.recurrence && t.status !== "done");
      if (spawns) {
        reload();
        offerUndo(`${n(before.length)}: ${label}`, () => {});
        return;
      }
      offerUndo(`${n(before.length)}: ${label}`, async () => {
        setTasks((prev) =>
          prev.map((t) => {
            const old = before.find((b) => b.id === t.id);
            if (!old) return t;
            const back: Partial<Task> = {};
            keys.forEach((k) => ((back as Record<string, unknown>)[k] = old[k]));
            return { ...t, ...back };
          }),
        );
        const results = await Promise.all(
          before.map((old) => {
            const back: Partial<Task> = {};
            keys.forEach((k) => ((back as Record<string, unknown>)[k] = old[k]));
            return supabase.from("tasks").update(back).eq("id", old.id);
          }),
        );
        if (results.some((r) => r.error)) fail("Nicht alles rückgängig gemacht");
      });
    },
    [supabase, tasks, setTasks, offerUndo, fail, reload],
  );

  const assign = useCallback(
    async (ids: string[], member: Member, add: boolean) => {
      const has = (id: string) => assignees.some((a) => a.task_id === id && a.user_id === member.id);
      const changed = ids.filter((id) => (add ? !has(id) : has(id)));
      if (!changed.length) return;
      const rows = changed.map((task_id) => ({ task_id, user_id: member.id }));
      const run = async (doAdd: boolean) => {
        if (doAdd) {
          setAssignees((prev) => [...prev, ...rows]);
          return supabase.from("task_assignees").upsert(rows, { ignoreDuplicates: true });
        }
        setAssignees((prev) => prev.filter((a) => !(a.user_id === member.id && changed.includes(a.task_id))));
        return supabase.from("task_assignees").delete().eq("user_id", member.id).in("task_id", changed);
      };
      const { error } = await run(add);
      if (error) return fail("Verantwortliche nicht gespeichert: " + error.message);
      offerUndo(`${n(changed.length)}: ${member.name} ${add ? "zugeteilt" : "entfernt"}`, async () => {
        const { error: e2 } = await run(!add);
        if (e2) fail("Nicht rückgängig gemacht: " + e2.message);
      });
    },
    [supabase, assignees, setAssignees, offerUndo, fail],
  );

  const remove = useCallback(
    async (ids: string[]) => {
      const gone = tasks.filter((t) => ids.includes(t.id));
      setTasks((prev) => prev.filter((t) => !ids.includes(t.id) && !(t.parent_id && ids.includes(t.parent_id))));
      const results = await Promise.all(ids.map((id) => supabase.rpc("trash_task", { t: id })));
      const bad = results.filter((r) => r.error).length;
      if (bad) fail(`${n(bad)} nicht gelöscht`);
      const done = ids.filter((_, i) => !results[i].error);
      if (!done.length) return;
      offerUndo(done.length === 1 ? `„${short(gone[0]?.title ?? "Aufgabe")}“ gelöscht` : `${n(done.length)} gelöscht`, async () => {
        const r2 = await Promise.all(done.map((id) => supabase.rpc("trash_restore", { k: "task", item: id })));
        if (r2.some((r) => r.error)) fail("Nicht alles wiederhergestellt – schau im Papierkorb nach.");
        reload();
      });
    },
    [supabase, tasks, setTasks, offerUndo, fail, reload],
  );

  return { patch, assign, remove };
}

type BarProps = {
  sel: Selection;
  /** Alle Aufgaben, die in der Ansicht gerade zu sehen sind (für „Alle auswählen“) */
  visibleIds: string[];
  tasks: Task[];
  members: Member[];
  assignees: Assignee[];
  /** Nur im Projekt: Rubriken und Meilensteine zum Zuordnen */
  sections?: Section[];
  milestones?: Milestone[];
  actions: ReturnType<typeof useBulkActions>;
};

type Panel = null | "status" | "due" | "prio" | "people" | "section" | "milestone" | "delete";

/** Leiste unten am Bildschirm, solange etwas ausgewählt ist (oder der Auswahlmodus an ist) */
export function BulkBar({ sel, visibleIds, tasks, members, assignees, sections, milestones, actions }: BarProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const [due, setDue] = useState("");
  const ids = useMemo(() => [...sel.ids], [sel.ids]);
  const count = ids.length;
  useEffect(() => {
    if (!count) setPanel(null);
  }, [count]);
  if (!sel.active && !count) return null;

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => sel.ids.has(id));
  const chosen = tasks.filter((t) => sel.ids.has(t.id));
  const go = async (fn: () => Promise<unknown>) => {
    setPanel(null);
    await fn();
  };

  const btn = (p: Panel, label: string) => (
    <button
      type="button"
      disabled={!count}
      aria-expanded={panel === p}
      onClick={() => setPanel(panel === p ? null : p)}
      className={`min-h-10 px-3 rounded-lg text-sm font-bold disabled:opacity-40 ${panel === p ? "bg-white/20" : "hover:bg-white/10"}`}
    >
      {label}
    </button>
  );
  const choice = (key: string, label: React.ReactNode, onClick: () => void, extra = "") => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`min-h-10 px-3 rounded-lg text-sm font-semibold border border-(--c-line) bg-(--c-surface) text-(--c-ink) hover:bg-(--c-hover) inline-flex items-center gap-2 ${extra}`}
    >
      {label}
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Mehrere Aufgaben bearbeiten"
      className="fixed z-40 bottom-4 left-1/2 -translate-x-1/2 w-[min(860px,calc(100%-24px))] flex flex-col gap-2"
    >
      {panel && count > 0 && (
        <div className="rounded-xl border border-(--c-line) bg-(--c-surface) shadow-2xl p-3 flex flex-wrap items-center gap-2">
          {panel === "status" &&
            STATUSES.map((s) =>
              choice(
                s.id,
                <>
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </>,
                () => go(() => actions.patch(ids, { status: s.id as TaskStatus }, `Status „${s.label}“`)),
              ),
            )}
          {panel === "prio" &&
            PRIORITIES.map((p) =>
              choice(p.id, p.label, () => go(() => actions.patch(ids, { priority: p.id as TaskPriority }, `Priorität „${p.label}“`))),
            )}
          {panel === "due" && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (due) go(() => actions.patch(ids, { due_date: due }, `fällig am ${formatDate(due)}`));
              }}
            >
              <label className="text-sm font-semibold text-(--c-text-2)" htmlFor="bulk-due">
                Fällig am
              </label>
              <input
                id="bulk-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="min-h-10 rounded-lg border border-(--c-line) bg-(--c-surface) px-2 text-sm"
              />
              <button type="submit" disabled={!due} className="min-h-10 px-3 rounded-lg text-sm font-bold bg-(--c-accent) text-white disabled:opacity-40">
                Übernehmen
              </button>
              {choice("none", "Kein Datum", () => go(() => actions.patch(ids, { due_date: null }, "Fälligkeit entfernt")))}
            </form>
          )}
          {panel === "people" && (
            <div className="flex flex-col gap-2 w-full">
              <p className="text-sm text-(--c-text-2)">Klick auf einen Namen: zuteilen. Mit ✕ bei allen Ausgewählten entfernen.</p>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const on = chosen.filter((t) => assignees.some((a) => a.task_id === t.id && a.user_id === m.id)).length;
                  return (
                    <span key={m.id} className="inline-flex rounded-lg border border-(--c-line) bg-(--c-surface) overflow-hidden">
                      <button
                        type="button"
                        onClick={() => go(() => actions.assign(ids, m, true))}
                        className="min-h-10 px-3 text-sm font-semibold text-(--c-ink) hover:bg-(--c-hover) inline-flex items-center gap-2"
                      >
                        <span aria-hidden className="size-2.5 rounded-full" style={{ background: m.color }} />
                        {m.name}
                        {on > 0 && <span className="text-xs text-(--c-muted)">({on}/{count})</span>}
                      </button>
                      {on > 0 && (
                        <button
                          type="button"
                          aria-label={`${m.name} bei allen entfernen`}
                          onClick={() => go(() => actions.assign(ids, m, false))}
                          className="min-h-10 px-2.5 border-l border-(--c-line) text-(--c-muted) hover:text-(--c-danger) hover:bg-(--c-hover)"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {panel === "section" && sections && (
            <>
              {choice("none", "Ohne Rubrik", () => go(() => actions.patch(ids, { section_id: null }, "ohne Rubrik")))}
              {sections.map((s) => choice(s.id, s.name, () => go(() => actions.patch(ids, { section_id: s.id }, `nach „${s.name}“`))))}
            </>
          )}
          {panel === "milestone" && milestones && (
            <>
              {choice("none", "Kein Meilenstein", () => go(() => actions.patch(ids, { milestone_id: null }, "ohne Meilenstein")))}
              {milestones.map((m) => choice(m.id, m.name, () => go(() => actions.patch(ids, { milestone_id: m.id }, `Meilenstein „${m.name}“`))))}
            </>
          )}
          {panel === "delete" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-(--c-ink)">{n(count)} in den Papierkorb legen?</span>
              <button
                type="button"
                onClick={() => go(() => actions.remove(ids))}
                className="min-h-10 px-3 rounded-lg text-sm font-bold bg-(--c-danger) text-(--c-on-danger)"
              >
                Ja, löschen
              </button>
              {choice("cancel", "Abbrechen", () => setPanel(null))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl bg-(--c-ink) text-(--c-on-ink) shadow-2xl px-2 py-1.5 flex flex-wrap items-center gap-1">
        <span className="px-2 text-sm font-bold whitespace-nowrap" aria-live="polite">
          {count ? `${count} ausgewählt` : "Klick Aufgaben an"}
        </span>
        <button
          type="button"
          onClick={() => sel.setMany(visibleIds, !allSelected)}
          className="min-h-10 px-3 rounded-lg text-sm font-semibold underline underline-offset-4 hover:bg-white/10"
        >
          {allSelected ? "Keine" : "Alle"}
        </button>
        <span aria-hidden className="w-px h-6 bg-white/20 mx-1" />
        {btn("status", "Status")}
        {btn("due", "Fällig")}
        {btn("people", "Wer")}
        {btn("prio", "Priorität")}
        {sections && btn("section", "Rubrik")}
        {milestones && milestones.length > 0 && btn("milestone", "Meilenstein")}
        {btn("delete", "Löschen")}
        <button
          type="button"
          onClick={sel.clear}
          className="ml-auto min-h-10 px-3 rounded-lg text-sm font-bold hover:bg-white/10"
        >
          Fertig
        </button>
      </div>
    </div>
  );
}

/** Knopf in der Ansichtsleiste: Auswahlmodus ein/aus */
export function SelectToggle({ sel }: { sel: Selection }) {
  const on = sel.active || sel.ids.size > 0;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => (on ? sel.clear() : sel.setActive(true))}
      title="Mehrere Aufgaben auswählen und gemeinsam ändern (auch mit Strg + Klick)"
      className={`min-h-11 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-2 border ${
        on ? "border-(--c-accent) bg-(--c-accent-soft) text-(--c-accent-ink)" : "border-(--c-line) hover:bg-(--c-hover)"
      }`}
    >
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <path d="M14.5 17l2 2 3.5-4" />
      </svg>
      {on ? "Auswahl beenden" : "Auswählen"}
    </button>
  );
}
