"use client";

import { useState } from "react";
import type { Task, TaskStatus } from "@/lib/database.types";
import { STATUS_TINT, formatDate, isOverdue, priorityOf, recurrenceLabel, statusOf } from "@/lib/labels";
import { Avatar } from "@/components/avatar";
import { StatusBar } from "@/components/status-bar";
import type { Member } from "@/components/project-view";

export type BoardColumn = {
  key: string;
  title: string;
  /** Statusspalte: Farbe + Status; Rubrik: section_id (null = ohne Rubrik) */
  status?: TaskStatus;
  sectionId?: string | null;
  editable?: boolean;
};

type Drop = { col: string; before: string | null } | null;

type Props = {
  columns: BoardColumn[];
  tasksOf: (col: BoardColumn) => Task[];
  colorful: boolean;
  openId: string | null;
  subtasksOf: (id: string) => Task[];
  peopleOf: (id: string) => Member[];
  milestoneName: (id: string | null) => string;
  onOpen: (id: string) => void;
  onToggleDone: (task: Task) => void;
  onMove: (taskId: string, col: BoardColumn, beforeId: string | null) => void;
  onQuickAdd: (col: BoardColumn, title: string) => void;
  onAddSection?: (name: string) => void;
  onRenameSection?: (id: string, name: string) => void;
  onDeleteSection?: (id: string) => void;
  onShiftSection?: (id: string, dir: -1 | 1) => void;
};

export function Board(props: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);

  function finish(col: BoardColumn) {
    if (dragId) props.onMove(dragId, col, drop?.col === col.key ? drop.before : null);
    setDragId(null);
    setDrop(null);
  }

  return (
    <div className="relative overflow-x-auto pb-2">
      <div className="flex gap-3.5 items-start">
        {props.columns.map((col, ci) => {
          const list = props.tasksOf(col);
          const counts = { todo: 0, doing: 0, review: 0, done: 0 } as Record<TaskStatus, number>;
          list.forEach((t) => (counts[t.status] += 1));
          const statusColor = col.status ? statusOf(col.status).color : null;
          return (
            <section
              key={col.key}
              aria-label={col.title}
              onDragOver={(e) => {
                e.preventDefault();
                if (drop?.col !== col.key) setDrop({ col: col.key, before: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                finish(col);
              }}
              className={`flex-[1_0_272px] max-w-[340px] rounded-xl p-2.5 flex flex-col gap-2 transition-colors ${
                dragId && drop?.col === col.key ? "bg-[#DCE3EA]" : "bg-[#E8EBEE]"
              }`}
            >
              <ColumnHeader
                col={col}
                count={list.length}
                statusColor={statusColor}
                isFirst={ci === 0 || !props.columns[ci - 1]?.editable}
                isLast={ci === props.columns.length - 1}
                onRename={props.onRenameSection}
                onDelete={props.onDeleteSection}
                onShift={props.onShiftSection}
              />
              {props.colorful && (
                <div className="px-1.5 pb-1">
                  <StatusBar counts={counts} height={6} />
                </div>
              )}

              {list.map((t) => (
                <div
                  key={t.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    const after = e.clientY > r.top + r.height / 2;
                    const idx = list.findIndex((x) => x.id === t.id);
                    const before = after ? list[idx + 1]?.id ?? null : t.id;
                    if (drop?.col !== col.key || drop.before !== before) setDrop({ col: col.key, before });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(col);
                  }}
                >
                  {dragId && dragId !== t.id && drop?.col === col.key && drop.before === t.id && <DropLine />}
                  <TaskCard
                    task={t}
                    colorful={props.colorful}
                    dragging={dragId === t.id}
                    subtasks={props.subtasksOf(t.id)}
                    people={props.peopleOf(t.id)}
                    milestone={props.milestoneName(t.milestone_id)}
                    selected={props.openId === t.id}
                    onOpen={() => props.onOpen(t.id)}
                    onToggleDone={() => props.onToggleDone(t)}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDrop(null);
                    }}
                  />
                </div>
              ))}
              {dragId && drop?.col === col.key && drop.before === null && <DropLine />}

              <QuickAdd onAdd={(title) => props.onQuickAdd(col, title)} />
            </section>
          );
        })}

        {props.onAddSection && <AddSection onAdd={props.onAddSection} />}
      </div>
    </div>
  );
}

function DropLine() {
  return <div aria-hidden className="h-1 rounded-full bg-[#1F5FBF] my-0.5" />;
}

function ColumnHeader({
  col,
  count,
  statusColor,
  isFirst,
  isLast,
  onRename,
  onDelete,
  onShift,
}: {
  col: BoardColumn;
  count: number;
  statusColor: string | null;
  isFirst: boolean;
  isLast: boolean;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onShift?: (id: string, dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(col.title);
  const [menu, setMenu] = useState(false);
  const sectionId = col.sectionId ?? null;

  if (editing && sectionId && onRename) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onRename(sectionId, name.trim());
          setEditing(false);
        }}
        className="flex gap-1.5 px-0.5"
      >
        <label className="sr-only" htmlFor={`rn-${sectionId}`}>Name der Rubrik</label>
        <input
          id={`rn-${sectionId}`}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== col.title) onRename(sectionId, name.trim());
            setEditing(false);
          }}
          className="min-w-0 flex-1 h-9 rounded-lg border border-[#C9D0D6] px-2.5 text-sm font-bold bg-white"
        />
      </form>
    );
  }

  return (
    <div className="relative flex items-center gap-2 px-1.5 min-h-9">
      {statusColor && <span aria-hidden className="size-2.5 rounded-full" style={{ background: statusColor }} />}
      <h3 className="text-sm font-bold truncate">{col.title}</h3>
      <span className="text-xs font-bold text-[#5A626B]">{count}</span>
      {col.editable && sectionId && (
        <>
          <button
            type="button"
            aria-label={`Rubrik ${col.title} bearbeiten`}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            className="ml-auto size-8 rounded-lg hover:bg-[#DCE1E6] flex items-center justify-center text-[#3E4650]"
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-10 z-10 w-48 rounded-lg border border-[#DDE1E5] bg-white shadow-lg py-1 text-sm">
              <MenuItem onClick={() => { setMenu(false); setEditing(true); }}>Umbenennen</MenuItem>
              {!isFirst && <MenuItem onClick={() => { setMenu(false); onShift?.(sectionId, -1); }}>Nach links</MenuItem>}
              {!isLast && <MenuItem onClick={() => { setMenu(false); onShift?.(sectionId, 1); }}>Nach rechts</MenuItem>}
              <MenuItem danger onClick={() => { setMenu(false); onDelete?.(sectionId); }}>Rubrik löschen</MenuItem>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full text-left px-3 min-h-10 hover:bg-[#F2F4F5] font-semibold ${danger ? "text-[#9A3412]" : ""}`}
    >
      {children}
    </button>
  );
}

function AddSection({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-[0_0_220px] min-h-12 rounded-xl border-2 border-dashed border-[#C9D0D6] text-sm font-semibold text-[#3E4650] hover:border-[#9AA4AE] hover:bg-white"
      >
        + Rubrik hinzufügen
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onAdd(name.trim());
        setName("");
        setOpen(false);
      }}
      className="flex-[0_0_260px] rounded-xl bg-white border border-[#DDE1E5] p-2.5 flex flex-col gap-2"
    >
      <label className="sr-only" htmlFor="new-section">Name der Rubrik</label>
      <input
        id="new-section"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder="z. B. Recherche, Behörden, Marketing"
        className="h-10 rounded-lg border border-[#DDE1E5] px-3 text-sm"
      />
      <div className="flex gap-2">
        <button type="submit" className="h-10 px-4 rounded-lg bg-[#16191D] text-white text-sm font-bold">
          Anlegen
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 px-3 text-sm font-semibold">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ Karte
export function TaskCard({
  task,
  colorful,
  dragging,
  subtasks,
  people,
  milestone,
  selected,
  onOpen,
  onToggleDone,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  colorful: boolean;
  dragging: boolean;
  subtasks: Task[];
  people: Member[];
  milestone: string;
  selected: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const prio = priorityOf(task.priority);
  const st = statusOf(task.status);
  const done = task.status === "done";
  const subDone = subtasks.filter((s) => s.status === "done").length;
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`relative rounded-lg border-2 overflow-hidden transition ${dragging ? "opacity-40" : ""} ${
        selected ? "border-[#1F5FBF]" : "border-transparent hover:border-[#C9D0D6]"
      } ${done && colorful ? "opacity-75" : ""}`}
      style={{ background: colorful ? STATUS_TINT[task.status] : "#FFFFFF" }}
    >
      {colorful && <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: st.color }} />}
      <div className={`flex gap-2 p-3 ${colorful ? "pl-4" : ""}`}>
        <button
          type="button"
          onClick={onToggleDone}
          aria-label={done ? `${task.title} wieder öffnen` : `${task.title} als erledigt markieren`}
          aria-pressed={done}
          className="shrink-0 size-6 -mt-0.5 rounded-full border-2 flex items-center justify-center hover:scale-110 transition"
          style={{ borderColor: done ? "#0E7C66" : "#9AA4AE", background: done ? "#0E7C66" : "transparent" }}
        >
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={done ? "#FFFFFF" : "#9AA4AE"} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-10" />
          </svg>
        </button>
        <button type="button" onClick={onOpen} aria-expanded={selected} className="min-w-0 flex-1 text-left flex flex-col gap-2 cursor-pointer">
          {colorful && (
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: statusTextColor(task.status) }}>
              {st.label}
            </span>
          )}
          <span className={`font-semibold leading-snug ${done ? "line-through text-[#5A626B]" : ""}`}>{task.title}</span>
          <span className="flex flex-wrap gap-1.5">
            {task.priority !== "medium" && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: prio.bg, color: prio.fg }}>
                {prio.label}
              </span>
            )}
            {milestone && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#EEF1F4] text-[#3E4650] max-w-full truncate">{milestone}</span>
            )}
          </span>
          {(task.due_date || subtasks.length > 0 || people.length > 0 || task.recurrence) && (
            <span className="flex items-center gap-3 text-xs font-semibold text-[#5A626B]">
              {task.due_date && (
                <span className={overdue ? "text-[#9A3412]" : ""}>
                  {overdue ? "Überfällig: " : ""}
                  {formatDate(task.due_date)}
                </span>
              )}
              {task.recurrence && (
                <span title={`Wiederholt sich ${recurrenceLabel(task.recurrence).toLowerCase()}`} className="flex items-center gap-1">
                  <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />
                  </svg>
                  <span className="sr-only">Wiederholt sich {recurrenceLabel(task.recurrence).toLowerCase()}</span>
                </span>
              )}
              {subtasks.length > 0 && (
                <span>
                  {subDone}/{subtasks.length}
                  <span className="sr-only"> Unteraufgaben erledigt</span>
                </span>
              )}
              <span className="ml-auto flex">
                {people.map((p) => (
                  <Avatar key={p.id} member={p} size={24} className="-ml-1.5 border-2 border-white" />
                ))}
              </span>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function statusTextColor(s: TaskStatus) {
  return { todo: "#4F5862", doing: "#174A94", review: "#8A3F12", done: "#0B5E4E" }[s];
}

export function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (v) onAdd(v);
        setValue("");
      }}
    >
      <input
        aria-label="Neue Aufgabe"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+ Aufgabe hinzufügen"
        className="w-full h-11 rounded-lg bg-transparent px-3 text-sm placeholder:text-[#5A626B] focus:bg-white focus:outline-2 focus:outline-[#1F5FBF]"
      />
    </form>
  );
}
