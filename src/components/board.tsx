"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Task, TaskPriority, TaskStatus } from "@/lib/database.types";
import { PRIORITIES, STATUS_TINT, formatDate, isOverdue, priorityOf, recurrenceLabel, statusOf } from "@/lib/labels";
import { Avatar } from "@/components/avatar";
import { StatusBar } from "@/components/status-bar";
import type { Member } from "@/components/project-view";

export type BoardColumn = {
  key: string;
  title: string;
  /** Statusspalte: Farbe + Status; Rubrik: section_id (null = ohne Rubrik) */
  status?: TaskStatus;
  sectionId?: string | null;
  /** Spalte eines Projekts (Rubrik-Ansicht über mehrere Projekte) */
  projectId?: string;
  editable?: boolean;
  /** Spaltentitel wird zum Link (z. B. Rubrik öffnen) */
  href?: string;
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
  onQuickAdd?: (col: BoardColumn, title: string, extra: NewTaskExtra) => void;
  /** Projekt der Aufgabe auf der Karte anzeigen (Ansicht über mehrere Projekte) */
  projectOf?: (task: Task) => { name: string; color: string } | undefined;
  /** Anzahl Dateien/Links je Aufgabe (Büroklammer) */
  attachmentsOf?: (id: string) => number;
  onAddSection?: (name: string) => void;
  onRenameSection?: (id: string, name: string) => void;
  onDeleteSection?: (id: string) => void;
  onShiftSection?: (id: string, dir: -1 | 1) => void;
  /** Nur ansehen: nichts ziehen, nichts abhaken */
  readOnly?: boolean;
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
    // Eigener Scrollbereich (max. Fensterhöhe), damit die Spaltenköpfe beim Runterscrollen oben stehen bleiben
    <div data-board-scroll className="relative overflow-auto overscroll-contain pb-2 max-h-[calc(100dvh-1rem)]">
      {/* items-stretch: alle Spalten gleich hoch, damit jeder Kopf beim Scrollen stehen bleibt */}
      <div className="flex gap-3.5 items-stretch">
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
                if (props.readOnly) return;
                e.preventDefault();
                if (drop?.col !== col.key) setDrop({ col: col.key, before: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                finish(col);
              }}
              className="flex-[1_0_272px] max-w-[340px] flex flex-col"
            >
              <div data-col-head className={`sticky top-0 z-10 px-2.5 pt-2.5 pb-1 rounded-t-xl backdrop-blur-sm transition-colors ${dragId && drop?.col === col.key ? "bg-(--c-col-drop)" : "bg-(--c-col)"}`}>
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
                  <div className="px-1.5 pt-1">
                    <StatusBar counts={counts} height={6} />
                  </div>
                )}
              </div>
              <div className={`px-2.5 pb-2.5 pt-1 rounded-b-xl flex flex-col gap-2 transition-colors ${dragId && drop?.col === col.key ? "bg-(--c-col-drop)" : "bg-(--c-col)"}`}>

              {list.map((t) => (
                <div
                  key={t.id}
                  onDragOver={(e) => {
                    if (props.readOnly) return;
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
                    project={props.projectOf?.(t)}
                    attachments={props.attachmentsOf?.(t.id) ?? 0}
                    selected={props.openId === t.id}
                    readOnly={props.readOnly}
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

              {props.onQuickAdd && <QuickAdd where={col.title} onAdd={(title, extra) => props.onQuickAdd?.(col, title, extra)} />}
              </div>
              {/* freie Fläche unter kurzen Spalten: nimmt beim Ziehen ebenfalls Aufgaben an */}
              <div aria-hidden className={`flex-1 min-h-4 rounded-xl ${dragId && drop?.col === col.key ? "bg-(--c-col-drop)/60" : ""}`} />
            </section>
          );
        })}

        {props.onAddSection && <AddSection onAdd={props.onAddSection} />}
      </div>
    </div>
  );
}

export function DropLine() {
  return <div aria-hidden className="h-1 rounded-full bg-(--c-accent) my-0.5" />;
}

export function ColumnHeader({
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
          className="min-w-0 flex-1 h-9 rounded-lg border border-(--c-line-strong) px-2.5 text-sm font-bold bg-(--c-surface)"
        />
      </form>
    );
  }

  return (
    <div className="relative flex items-center gap-2 px-1.5 min-h-9">
      {statusColor && <span aria-hidden className="size-2.5 rounded-full" style={{ background: statusColor }} />}
      <h3 className="text-sm font-bold truncate">
        {col.href ? (
          <Link href={col.href} title={`Alle Aufgaben in „${col.title}“ anzeigen`} className="hover:underline underline-offset-4 decoration-2">
            {col.title}
          </Link>
        ) : (
          col.title
        )}
      </h3>
      <span className="text-xs font-bold text-(--c-muted)">{count}</span>
      {col.editable && sectionId && (
        <>
          <button
            type="button"
            aria-label={`Rubrik ${col.title} bearbeiten`}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            className="ml-auto size-8 rounded-lg hover:bg-(--c-col-btn-hover) flex items-center justify-center text-(--c-text-2)"
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-10 z-10 w-48 rounded-lg border border-(--c-line) bg-(--c-surface) shadow-lg py-1 text-sm">
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
      className={`w-full text-left px-3 min-h-10 hover:bg-(--c-bg) font-semibold ${danger ? "text-(--c-danger)" : ""}`}
    >
      {children}
    </button>
  );
}

export function AddSection({ onAdd, placeholder = "z. B. Recherche, Behörden, Marketing" }: { onAdd: (name: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-panel="soft"
        className="self-start sticky top-0 z-10 flex-[0_0_220px] min-h-12 rounded-xl bg-(--c-bg) border-2 border-dashed border-(--c-line-strong) text-sm font-semibold text-(--c-text-2) hover:border-(--c-line-hover) hover:bg-(--c-surface)"
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
      className="self-start sticky top-0 z-10 flex-[0_0_260px] rounded-xl bg-(--c-surface) border border-(--c-line) p-2.5 flex flex-col gap-2"
    >
      <input
        aria-label="Name der Rubrik"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg border border-(--c-line) px-3 text-sm"
      />
      <div className="flex gap-2">
        <button type="submit" className="h-10 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold">
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
  project,
  attachments = 0,
  selected,
  readOnly = false,
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
  project?: { name: string; color: string };
  attachments?: number;
  selected: boolean;
  readOnly?: boolean;
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
      draggable={!readOnly}
      data-card
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`relative rounded-lg border-2 overflow-hidden transition ${dragging ? "opacity-40" : ""} ${
        selected ? "border-(--c-accent)" : "border-transparent hover:border-(--c-line-strong)"
      } ${done && colorful ? "opacity-75" : ""}`}
      style={{ background: colorful ? STATUS_TINT[task.status] : "var(--c-surface)" }}
    >
      {colorful && <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: st.color }} />}
      <div className={`flex gap-2 p-3 ${colorful ? "pl-4" : ""}`}>
        <button
          type="button"
          onClick={onToggleDone}
          disabled={readOnly}
          aria-label={done ? `${task.title} wieder öffnen` : `${task.title} als erledigt markieren`}
          aria-pressed={done}
          className={`shrink-0 size-6 -mt-0.5 rounded-full border-2 flex items-center justify-center transition ${readOnly ? "cursor-default" : "hover:scale-110"}`}
          style={{ borderColor: done ? "var(--st-done)" : "var(--c-line-hover)", background: done ? "var(--st-done)" : "transparent" }}
        >
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={done ? "#FFFFFF" : "var(--c-line-hover)"} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-10" />
          </svg>
        </button>
        <button type="button" onClick={onOpen} aria-expanded={selected} className="min-w-0 flex-1 text-left flex flex-col gap-2 cursor-pointer">
          {colorful && (
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: statusTextColor(task.status) }}>
              {st.label}
            </span>
          )}
          <span className={`font-semibold leading-snug ${done ? "line-through text-(--c-muted)" : ""}`}>{task.title}</span>
          {project && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-(--c-text-2) min-w-0">
              <span aria-hidden className="size-2 rounded-sm shrink-0" style={{ background: project.color }} />
              <span className="truncate">
                <span className="sr-only">Projekt: </span>
                {project.name}
              </span>
            </span>
          )}
          <span className="flex flex-wrap gap-1.5">
            {task.priority !== "medium" && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: prio.bg, color: prio.fg }}>
                {prio.label}
              </span>
            )}
            {milestone && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-(--c-line-soft) text-(--c-text-2) max-w-full truncate">{milestone}</span>
            )}
          </span>
          {(task.due_date || subtasks.length > 0 || people.length > 0 || task.recurrence || attachments > 0) && (
            <span className="flex items-center gap-3 text-xs font-semibold text-(--c-muted)">
              {task.due_date && (
                <span className={overdue ? "text-(--c-danger)" : ""}>
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
              {attachments > 0 && (
                <span className="flex items-center gap-0.5" title={`${attachments} ${attachments === 1 ? "Datei oder Link" : "Dateien oder Links"}`}>
                  <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
                  </svg>
                  {attachments}
                  <span className="sr-only"> {attachments === 1 ? "Anhang" : "Anhänge"}</span>
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
                  <Avatar key={p.id} member={p} size={24} className="-ml-1.5 border-2 border-(--c-surface)" />
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
  return { todo: "var(--st-todo-ink)", doing: "var(--st-doing-ink)", review: "var(--st-review-ink)", done: "var(--st-done-ink)" }[s];
}

/** Zusatzangaben aus dem Fenster "Neue Aufgabe" */
export type NewTaskExtra = Partial<Pick<Task, "description" | "start_date" | "due_date" | "priority">>;

/** "+ Aufgabe hinzufügen": öffnet ein Fenster zum Anlegen der Aufgabe */
export function QuickAdd({ onAdd, where }: { onAdd: (title: string, extra: NewTaskExtra) => void; where?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Neue Aufgabe"
        onClick={() => setOpen(true)}
        className="w-full h-11 rounded-lg px-3 text-left text-sm text-(--c-muted) hover:bg-(--c-surface) hover:text-(--c-ink) focus-visible:outline-2 focus-visible:outline-(--c-accent)"
      >
        + Aufgabe hinzufügen
      </button>
      {open && <NewTaskDialog where={where} onAdd={onAdd} onClose={() => setOpen(false)} />}
    </>
  );
}

const dlgField = "h-11 rounded-lg border border-(--c-line) px-3 bg-(--c-surface) font-normal text-sm";

function NewTaskDialog({ onAdd, onClose, where }: { onAdd: (title: string, extra: NewTaskExtra) => void; onClose: () => void; where?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [more, setMore] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    d?.querySelector<HTMLInputElement>("#nt-title")?.focus();
    return () => d?.close();
  }, []);

  function submit(again: boolean) {
    const t = title.trim();
    if (!t) return;
    onAdd(t, {
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(start ? { start_date: start } : {}),
      ...(due ? { due_date: due } : {}),
      ...(priority !== "medium" ? { priority } : {}),
    });
    if (again) {
      setTitle("");
      setDescription("");
      ref.current?.querySelector<HTMLInputElement>("#nt-title")?.focus();
    } else onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-label="Neue Aufgabe"
      data-lock
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="bg-(--c-surface) text-(--c-ink) p-0 backdrop:bg-black/45 m-auto w-[min(520px,calc(100%-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl border border-(--c-line) shadow-2xl"
    >
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">Neue Aufgabe</h2>
            {where && <p className="text-sm text-(--c-muted)">in „{where}“</p>}
          </div>
          <button type="button" aria-label="Fenster schließen" onClick={onClose} className="size-11 -mr-2 -mt-2 rounded-lg text-xl text-(--c-muted) hover:bg-(--c-hover)">
            ×
          </button>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Titel
          <input
            id="nt-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            enterKeyHint="done"
            placeholder="Was ist zu tun?"
            className={dlgField}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Start
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={dlgField} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Fällig
            <input type="date" value={due} min={start || undefined} onChange={(e) => setDue(e.target.value)} className={dlgField} />
          </label>
        </div>

        {more ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Priorität
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={dlgField}>
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Beschreibung
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="rounded-lg border border-(--c-line) px-3 py-2 bg-(--c-surface) font-normal text-sm"
              />
            </label>
          </>
        ) : (
          <button type="button" onClick={() => setMore(true)} className="self-start min-h-11 text-sm font-semibold text-(--c-accent) hover:underline underline-offset-4">
            + Priorität und Beschreibung
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" disabled={!title.trim()} className="h-11 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-40">
            Anlegen
          </button>
          <button
            type="button"
            disabled={!title.trim()}
            onClick={() => submit(true)}
            className="h-11 px-4 rounded-lg border border-(--c-line) text-sm font-semibold hover:bg-(--c-hover) disabled:opacity-40"
          >
            Anlegen und nächste
          </button>
          <button type="button" onClick={onClose} className="h-11 px-3 text-sm font-semibold text-(--c-muted) hover:text-(--c-ink)">
            Abbrechen
          </button>
        </div>
      </form>
    </dialog>
  );
}
