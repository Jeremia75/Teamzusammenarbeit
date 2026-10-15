"use client";

import { useState } from "react";
import type { Milestone, Task, TaskStatus } from "@/lib/database.types";
import { StatusBar } from "@/components/status-bar";
import { formatDate } from "@/lib/labels";

export function Milestones({
  milestones,
  tasks,
  onAdd,
  onDelete,
  selectedId,
  onSelect,
  readOnly = false,
}: {
  milestones: Milestone[];
  tasks: Task[];
  onAdd: (name: string, due: string | null) => void;
  onDelete: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [due, setDue] = useState("");

  return (
    <section aria-label="Meilensteine" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-(--c-muted)">Ziele &amp; Meilensteine</h2>
        {!readOnly && <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="min-h-11 px-3 text-sm font-semibold text-(--c-accent)"
        >
          {adding ? "Abbrechen" : "+ Meilenstein"}
        </button>}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onAdd(name.trim(), due || null);
            setName("");
            setDue("");
            setAdding(false);
          }}
          className="flex flex-wrap gap-3 items-end bg-(--c-surface) border border-(--c-line) rounded-xl p-4"
        >
          <label className="flex flex-col gap-1 text-sm font-semibold flex-[1_1_220px]">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="h-11 rounded-lg border border-(--c-line) px-3 font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Fällig am
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-11 rounded-lg border border-(--c-line) px-3 font-normal" />
          </label>
          <button type="submit" className="h-11 px-5 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold">
            Anlegen
          </button>
        </form>
      )}

      {milestones.length === 0 && !adding ? (
        <p className="text-sm text-(--c-muted)">
          {readOnly
            ? "Noch keine Meilensteine."
            : "Noch keine Meilensteine. Lege Etappenziele an und ordne ihnen Aufgaben zu, dann siehst du hier den Fortschritt."}
        </p>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {milestones.map((m) => {
            const mt = tasks.filter((t) => t.milestone_id === m.id);
            const done = mt.filter((t) => t.status === "done").length;
            const pct = mt.length ? Math.round((done / mt.length) * 100) : 0;
            const complete = mt.length > 0 && done === mt.length;
            const active = selectedId === m.id;
            const counts = { todo: 0, doing: 0, review: 0, done: 0 } as Record<TaskStatus, number>;
            mt.forEach((t) => (counts[t.status] += 1));
            return (
              <div
                key={m.id}
                data-card
                className={`relative bg-(--c-surface) rounded-xl border-2 transition ${
                  active ? "border-(--c-accent) shadow-sm" : "border-(--c-line) hover:border-(--c-line-hover)"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(active ? null : m.id)}
                  className="w-full text-left px-4 pt-3.5 pb-3 pr-11 flex flex-col gap-2.5 cursor-pointer"
                >
                  <span className="flex items-start gap-2">
                    <span className="font-bold flex-1">{m.name}</span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${
                        complete ? "bg-(--c-success-soft) text-(--c-success-ink)" : "bg-(--c-line-soft) text-(--c-text-2)"
                      }`}
                    >
                      {complete ? "Erreicht" : `${pct} %`}
                    </span>
                  </span>
                  <StatusBar counts={counts} height={6} />
                  <span className="text-sm text-(--c-muted)">
                    {done} von {mt.length} Aufgaben{m.due_date ? ` · fällig ${formatDate(m.due_date)}` : ""}
                  </span>
                  <span className="text-xs font-semibold text-(--c-accent)">
                    {active ? "Filter aktiv – erneut klicken zum Aufheben" : "Aufgaben anzeigen"}
                  </span>
                </button>
                {!readOnly && <button
                  type="button"
                  onClick={() => onDelete(m.id)}
                  aria-label={`Meilenstein ${m.name} löschen`}
                  className="absolute right-2 bottom-2 size-8 rounded-lg hover:bg-(--c-bg) flex items-center justify-center text-(--c-muted)"
                >
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
