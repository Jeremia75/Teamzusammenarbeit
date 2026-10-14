"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Comment, Milestone, Section, Task, TaskPriority, TaskRecurrence } from "@/lib/database.types";
import { PRIORITIES, RECURRENCES, STATUSES, formatDate } from "@/lib/labels";
import { Avatar } from "@/components/avatar";
import type { Member } from "@/components/project-view";

type Props = {
  task: Task;
  subtasks: Task[];
  milestones: Milestone[];
  sections: Section[];
  members: Member[];
  assigned: string[];
  currentUserId: string;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onAddSubtask: (title: string) => void;
  onDelete: (id: string) => void;
  onToggleAssignee: (userId: string) => void;
};

const field = "h-11 rounded-lg border border-(--c-line) px-3 bg-(--c-surface) font-normal text-sm";
const sectionLabel = "text-xs font-bold uppercase tracking-wider text-(--c-muted)";

export function TaskDetail(props: Props) {
  const { task, subtasks, onUpdate } = props;
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [newSub, setNewSub] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const subDone = subtasks.filter((s) => s.status === "done").length;
  const subPct = subtasks.length ? Math.round((subDone / subtasks.length) * 100) : 0;

  return (
    <TaskDialog onClose={props.onClose}>
    <aside aria-label="Aufgabendetails" className="bg-(--c-surface) p-5 sm:p-6 flex flex-col gap-5">
      <div className="sticky top-0 z-10 -mx-5 -mt-5 px-5 pt-5 pb-2 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6 bg-(--c-surface) border-b border-(--c-line-soft) flex items-start gap-2">
        <label className="sr-only" htmlFor="task-title">Titel</label>
        <textarea
          id="task-title"
          value={title}
          rows={2}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && onUpdate(task.id, { title: title.trim() })}
          className="flex-1 resize-none text-lg font-extrabold leading-snug rounded-lg px-2 py-1 -mx-2 hover:bg-(--c-hover) focus:bg-(--c-surface) focus:outline-2 focus:outline-(--c-accent)"
        />
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Details schließen"
          className="size-11 shrink-0 rounded-lg border border-(--c-line) flex items-center justify-center hover:bg-(--c-bg)"
        >
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className={sectionLabel}>Status</span>
        <div role="group" aria-label="Status ändern" className="grid grid-cols-2 gap-1.5">
          {STATUSES.map((s) => {
            const active = task.status === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() => onUpdate(task.id, { status: s.id })}
                className={`min-h-11 rounded-lg border text-sm font-bold flex items-center justify-center gap-1.5 ${
                  active ? "bg-(--c-ink) text-(--c-on-ink) border-(--c-ink)" : "bg-(--c-surface) border-(--c-line) hover:bg-(--c-hover)"
                }`}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
          Fällig am
          <input
            type="date"
            value={task.due_date ?? ""}
            onChange={(e) => onUpdate(task.id, { due_date: e.target.value || null })}
            className={`${field} text-(--c-ink)`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
          Priorität
          <select
            value={task.priority}
            onChange={(e) => onUpdate(task.id, { priority: e.target.value as TaskPriority })}
            className={`${field} text-(--c-ink)`}
          >
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
          Wiederholen
          <select
            value={task.recurrence ?? ""}
            onChange={(e) => onUpdate(task.id, { recurrence: (e.target.value || null) as TaskRecurrence | null, recurrence_spawned: false })}
            className={`${field} text-(--c-ink)`}
          >
            <option value="">Nicht wiederholen</option>
            {RECURRENCES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          {task.recurrence && (
            <span className="font-normal text-(--c-text-2)">
              Wenn du sie erledigst, entsteht automatisch die nächste
              {task.due_date ? ` (ab ${formatDate(task.due_date)} gerechnet)` : " (ab heute gerechnet)"}.
            </span>
          )}
        </label>
        {!task.parent_id && props.sections.length > 0 && (
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
            Rubrik
            <select
              value={task.section_id ?? ""}
              onChange={(e) => onUpdate(task.id, { section_id: e.target.value || null })}
              className={`${field} text-(--c-ink)`}
            >
              <option value="">Ohne Rubrik</option>
              {props.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!task.parent_id && (
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
            Meilenstein
            <select
              value={task.milestone_id ?? ""}
              onChange={(e) => onUpdate(task.id, { milestone_id: e.target.value || null })}
              className={`${field} text-(--c-ink)`}
            >
              <option value="">Kein Meilenstein</option>
              {props.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className={sectionLabel}>Verantwortlich</span>
        <div className="flex flex-wrap gap-2">
          {props.members.map((m) => {
            const on = props.assigned.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => props.onToggleAssignee(m.id)}
                className={`min-h-11 rounded-full pl-1.5 pr-3.5 flex items-center gap-2 text-sm font-semibold border ${
                  on ? "border-(--c-accent) bg-(--c-accent-soft)" : "border-(--c-line) bg-(--c-surface) hover:bg-(--c-hover)"
                }`}
              >
                <Avatar member={m} size={28} />
                {m.id === props.currentUserId ? `${m.name} (ich)` : m.name}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <span className={sectionLabel}>Beschreibung</span>
        <textarea
          value={description}
          rows={3}
          placeholder="Details, Links, Notizen …"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== task.description && onUpdate(task.id, { description })}
          className="rounded-lg border border-(--c-line) p-3 text-sm resize-y"
        />
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={sectionLabel}>Unteraufgaben</span>
          {subtasks.length > 0 && (
            <span className="text-sm font-bold text-(--c-text-2)">
              {subDone}/{subtasks.length} erledigt
            </span>
          )}
        </div>
        {subtasks.length > 0 && (
          <span className="block h-1.5 rounded bg-(--c-col) overflow-hidden">
            <span className="block h-full rounded bg-(--c-success) transition-all" style={{ width: `${subPct}%` }} />
          </span>
        )}
        <ul className="flex flex-col">
          {subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-3 min-h-11 border-b border-(--c-line-soft)">
              <input
                type="checkbox"
                id={`sub-${s.id}`}
                checked={s.status === "done"}
                onChange={(e) => onUpdate(s.id, { status: e.target.checked ? "done" : "todo" })}
                className="size-[18px] accent-(--c-accent) cursor-pointer"
              />
              <label
                htmlFor={`sub-${s.id}`}
                className={`flex-1 text-sm cursor-pointer ${s.status === "done" ? "line-through text-(--c-muted)" : ""}`}
              >
                {s.title}
              </label>
              <button
                type="button"
                onClick={() => props.onDelete(s.id)}
                aria-label={`Unteraufgabe ${s.title} löschen`}
                className="size-9 rounded-lg hover:bg-(--c-bg) flex items-center justify-center text-(--c-muted)"
              >
                <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = newSub.trim();
            if (v) props.onAddSubtask(v);
            setNewSub("");
          }}
          className="flex gap-2"
        >
          <label className="sr-only" htmlFor="new-sub">Neue Unteraufgabe</label>
          <input
            id="new-sub"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            placeholder="Unteraufgabe hinzufügen"
            className={`${field} flex-1 min-w-0`}
          />
          <button type="submit" className="h-11 px-4 rounded-lg border border-(--c-line) text-sm font-bold hover:bg-(--c-hover)">
            +
          </button>
        </form>
      </div>

      <Comments taskId={task.id} members={props.members} currentUserId={props.currentUserId} />

      <div className="border-t border-(--c-line-soft) pt-4">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              {subtasks.length ? "Aufgabe samt Unteraufgaben löschen?" : "Aufgabe wirklich löschen?"}
            </span>
            <button
              type="button"
              onClick={() => props.onDelete(task.id)}
              className="min-h-11 px-4 rounded-lg bg-(--c-danger) text-(--c-on-danger) text-sm font-bold"
            >
              Löschen
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 px-4 rounded-lg border border-(--c-line) text-sm font-bold">
              Abbrechen
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 text-sm font-semibold text-(--c-danger)">
            Aufgabe löschen
          </button>
        )}
      </div>
    </aside>
    </TaskDialog>
  );
}

/**
 * Fenster für die Aufgabendetails: am Handy über den ganzen Bildschirm,
 * am PC mittig über dem Inhalt (neben der Seitenleiste). Esc oder Klick daneben schließt.
 */
function TaskDialog({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Fokus auf "Schließen" statt auf das Titelfeld – sonst springt am Handy die Tastatur auf
    d?.querySelector<HTMLButtonElement>('button[aria-label="Details schließen"]')?.focus();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="Aufgabe bearbeiten"
      data-lock
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="task-dialog bg-(--c-surface) text-(--c-ink) p-0 overflow-y-auto overscroll-contain backdrop:bg-black/45
        m-0 w-full h-full max-w-none max-h-none
        md:m-auto md:h-auto md:w-[min(680px,calc(100%-260px-48px))] md:max-h-[calc(100dvh-48px)] md:rounded-2xl md:border md:border-(--c-line) md:shadow-2xl"
    >
      {children}
    </dialog>
  );
}

function Comments({ taskId, members, currentUserId }: { taskId: string; members: Member[]; currentUserId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const byId = new Map(members.map((m) => [m.id, m]));

  useEffect(() => {
    let active = true;
    supabase
      .from("comments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at")
      .then(({ data }) => {
        if (active && data) setComments(data);
      });
    return () => {
      active = false;
    };
  }, [supabase, taskId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody("");
    const { data } = await supabase
      .from("comments")
      .insert({ task_id: taskId, body: text, author_id: currentUserId })
      .select()
      .single();
    if (data) setComments((prev) => [...prev, data]);
  }

  return (
    <div className="flex flex-col gap-3">
      <span className={sectionLabel}>Kommentare</span>
      {comments.map((c) => {
        const author = byId.get(c.author_id) ?? { name: "Ehemaliges Mitglied", color: "#8A94A0" };
        return (
          <div key={c.id} className="flex gap-2.5">
            <Avatar member={author} size={28} />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs text-(--c-muted)">
                <strong className="text-(--c-ink)">{author.name}</strong> ·{" "}
                {new Date(c.created_at).toLocaleString("de-AT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          </div>
        );
      })}
      <form onSubmit={send} className="flex gap-2">
        <label className="sr-only" htmlFor="new-comment">Kommentar</label>
        <input
          id="new-comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Kommentar schreiben"
          className={`${field} flex-1 min-w-0`}
        />
        <button type="submit" className="h-11 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold">
          Senden
        </button>
      </form>
    </div>
  );
}
