"use client";

import { useState } from "react";
import type { Milestone, Task } from "@/lib/database.types";
import { formatDate } from "@/lib/labels";

export function Milestones({
  milestones,
  tasks,
  onAdd,
  onDelete,
}: {
  milestones: Milestone[];
  tasks: Task[];
  onAdd: (name: string, due: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [due, setDue] = useState("");

  return (
    <section aria-label="Meilensteine" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[#5A626B]">Ziele &amp; Meilensteine</h2>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="min-h-11 px-3 text-sm font-semibold text-[#1F5FBF]"
        >
          {adding ? "Abbrechen" : "+ Meilenstein"}
        </button>
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
          className="flex flex-wrap gap-3 items-end bg-white border border-[#DDE1E5] rounded-xl p-4"
        >
          <label className="flex flex-col gap-1 text-sm font-semibold flex-[1_1_220px]">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="h-11 rounded-lg border border-[#DDE1E5] px-3 font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Fällig am
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-11 rounded-lg border border-[#DDE1E5] px-3 font-normal" />
          </label>
          <button type="submit" className="h-11 px-5 rounded-lg bg-[#16191D] text-white font-bold">
            Anlegen
          </button>
        </form>
      )}

      {milestones.length === 0 && !adding ? (
        <p className="text-sm text-[#5A626B]">
          Noch keine Meilensteine. Lege Etappenziele an und ordne ihnen Aufgaben zu, dann siehst du hier den Fortschritt.
        </p>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {milestones.map((m) => {
            const mt = tasks.filter((t) => t.milestone_id === m.id);
            const done = mt.filter((t) => t.status === "done").length;
            const pct = mt.length ? Math.round((done / mt.length) * 100) : 0;
            const complete = mt.length > 0 && done === mt.length;
            return (
              <div key={m.id} className="bg-white border border-[#DDE1E5] rounded-xl px-4 py-3.5 flex flex-col gap-2.5">
                <div className="flex items-start gap-2">
                  <span className="font-bold flex-1">{m.name}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${
                      complete ? "bg-[#DDF2EC] text-[#0B5E4E]" : "bg-[#EEF1F4] text-[#3E4650]"
                    }`}
                  >
                    {complete ? "Erreicht" : `${pct} %`}
                  </span>
                </div>
                <span className="block h-1.5 rounded bg-[#E8EBEE] overflow-hidden">
                  <span
                    className="block h-full rounded transition-all"
                    style={{ width: `${pct}%`, background: complete ? "#0E7C66" : "#1F5FBF" }}
                  />
                </span>
                <div className="flex items-center gap-2 text-sm text-[#5A626B]">
                  <span>
                    {done} von {mt.length} Aufgaben{m.due_date ? ` · fällig ${formatDate(m.due_date)}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(m.id)}
                    aria-label={`Meilenstein ${m.name} löschen`}
                    className="ml-auto size-8 rounded-lg hover:bg-[#F2F4F5] flex items-center justify-center"
                  >
                    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
