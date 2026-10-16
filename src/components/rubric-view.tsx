"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Milestone, Section, Task, TaskStatus, WorkspaceRole } from "@/lib/database.types";
import { STATUSES } from "@/lib/labels";
import { byPosition, positionBetween } from "@/lib/ordering";
import { TaskDetail } from "@/components/task-detail";
import { useAttachmentCounts } from "@/components/attachments";
import { Board, NEW_TITLE, type BoardColumn } from "@/components/board";
import { short, useUndo } from "@/components/undo";
import { useNewTaskShortcut } from "@/components/shortcuts";
import { BulkBar, SelectToggle, useBulkActions, useSelection } from "@/components/bulk-edit";
import { StatusBar, StatusLegend } from "@/components/status-bar";
import { TaskList, type Assignee, type Member } from "@/components/project-view";

type ProjectInfo = { id: string; name: string; color: string };

type Props = {
  currentUserId: string;
  workspace: { id: string; name: string };
  rubric: { id: string; name: string };
  projects: ProjectInfo[];
  initialTasks: Task[];
  milestones: Milestone[];
  sections: Section[];
  initialAssignees: Assignee[];
  members: Member[];
  /** Meine Rolle im Bereich (Standard: Bearbeiten) */
  role?: WorkspaceRole;
};

type View = "projects" | "status" | "list";

/** Alle Aufgaben aller Projekte einer Projekt-Rubrik – im gleichen Schema wie die Projektansicht. */
export function RubricView(props: Props) {
  const { rubric, projects, members, currentUserId, milestones, sections } = props;
  const role = props.role ?? "editor";
  const readOnly = role !== "editor";
  const supabase = useMemo(() => createClient(), []);

  const [tasks, setTasks] = useState<Task[]>(props.initialTasks);
  const [assignees, setAssignees] = useState<Assignee[]>(props.initialAssignees);
  const [view, setViewState] = useState<View>("projects");
  const [onlyMine, setOnlyMine] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // gerade über "+ Aufgabe hinzufügen" angelegt (Titel noch offen)
  const [freshId, setFreshId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { offerUndo, undoToast } = useUndo();

  const viewKey = `projektraum:rview:${rubric.id}`;
  useEffect(() => {
    try {
      const v = localStorage.getItem(viewKey);
      if (v === "projects" || v === "status" || v === "list") setViewState(v);
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, [viewKey]);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(viewKey, v);
    } catch {
      /* ignorieren */
    }
  };

  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // ---------------------------------------------------------------- Daten
  const reload = useCallback(async () => {
    if (!projectIds.length) return;
    const [t, a] = await Promise.all([
      supabase.from("tasks").select("*").in("project_id", projectIds).order("position"),
      supabase.from("task_assignees").select("task_id, user_id, tasks!inner(project_id)").in("tasks.project_id", projectIds),
    ]);
    if (t.data) setTasks(t.data);
    if (a.data) setAssignees(a.data.map(({ task_id, user_id }) => ({ task_id, user_id })));
  }, [supabase, projectIds]);

  useEffect(() => {
    if (!projectIds.length) return;
    const channel = supabase
      .channel(`rubric-${rubric.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=in.(${projectIds.join(",")})` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, rubric.id, projectIds, reload]);

  const fail = useCallback(
    (msg: string) => {
      setError(msg);
      reload();
    },
    [reload],
  );

  const updateTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      const before = tasks.find((t) => t.id === id);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) return fail("Änderung nicht gespeichert: " + error.message);
      if (patch.status === "done" && before?.recurrence && before.status !== "done") reload();
    },
    [supabase, fail, tasks, reload],
  );

  const addTask = useCallback(
    async (projectId: string, title: string, extra: Partial<Task> = {}) => {
      const position = tasks.filter((t) => t.project_id === projectId).reduce((max, t) => Math.max(max, t.position), 0) + 1;
      const { data, error } = await supabase
        .from("tasks")
        .insert({ project_id: projectId, title, position, created_by: currentUserId, ...extra })
        .select()
        .single();
      if (error) return fail("Aufgabe nicht angelegt: " + error.message);
      setTasks((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data]));
      // Neue Aufgabe aus "+ Aufgabe hinzufügen": erst melden, wenn sie einen Titel hat (siehe closeDetail)
      if (title !== NEW_TITLE) window.dispatchEvent(new Event("projektraum:task-created"));
      return data;
    },
    [supabase, tasks, currentUserId, fail],
  );

  // "+ Aufgabe hinzufügen": Aufgabe gleich anlegen und ihr Fenster öffnen
  async function createAndOpen(projectId: string) {
    const t = await addTask(projectId, NEW_TITLE);
    if (t) {
      setFreshId(t.id);
      setOpenId(t.id);
    }
  }
  // Taste N: neue Aufgabe – nur eindeutig, wenn die Rubrik genau ein Projekt hat
  useNewTaskShortcut(
    readOnly
      ? null
      : () => {
          if (projects.length === 1) void createAndOpen(projects[0].id);
          else if (!projects.length) return "In dieser Rubrik gibt es noch kein Projekt.";
          else return "Hier sind mehrere Projekte – nimm „+ Aufgabe hinzufügen“ unter dem passenden Projekt.";
        },
  );
  // Fenster einer neuen Aufgabe ohne Titel und ohne Änderungen geschlossen: wieder entfernen
  function closeDetail(r?: { titled: boolean; touched: boolean }) {
    const id = openId;
    setOpenId(null);
    setFreshId(null);
    if (id && id === freshId && r?.titled) window.dispatchEvent(new Event("projektraum:task-created"));
    if (id && id === freshId && r && !r.titled && !r.touched) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      supabase.from("tasks").delete().eq("id", id).then(({ error }) => error && fail("Leere Aufgabe nicht entfernt: " + error.message));
    }
  }

  const attachIds = useMemo(() => projectIds, [projectIds]);
  const { counts: attachCounts, setCount: setAttachCount } = useAttachmentCounts(supabase, attachIds);

  const deleteTask = useCallback(
    async (id: string) => {
      const gone = tasks.find((t) => t.id === id);
      setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id));
      if (openId === id) setOpenId(null);
      // In den Papierkorb (samt Unteraufgaben) – 30 Tage wiederherstellbar, gleich danach mit "Rückgängig"
      const { error } = await supabase.rpc("trash_task", { t: id });
      if (error) return fail("Löschen fehlgeschlagen: " + error.message);
      offerUndo(`„${short(gone?.title ?? "Aufgabe")}“ gelöscht`, async () => {
        const { error: e2 } = await supabase.rpc("trash_restore", { k: "task", item: id });
        if (e2) fail("Nicht wiederhergestellt: " + e2.message);
        else reload();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, openId, fail, tasks, reload, offerUndo],
  );

  const toggleAssignee = useCallback(
    async (taskId: string, userId: string) => {
      const has = assignees.some((a) => a.task_id === taskId && a.user_id === userId);
      if (has) {
        setAssignees((prev) => prev.filter((a) => !(a.task_id === taskId && a.user_id === userId)));
        const { error } = await supabase.from("task_assignees").delete().eq("task_id", taskId).eq("user_id", userId);
        if (error) fail(error.message);
      } else {
        setAssignees((prev) => [...prev, { task_id: taskId, user_id: userId }]);
        const { error } = await supabase.from("task_assignees").insert({ task_id: taskId, user_id: userId });
        if (error) fail(error.message);
      }
    },
    [supabase, assignees, fail],
  );

  // ---------------------------------------------------------- Ableitungen
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const peopleOf = useCallback(
    (taskId: string) =>
      assignees
        .filter((a) => a.task_id === taskId)
        .map((a) => memberById.get(a.user_id))
        .filter((m): m is Member => !!m),
    [assignees, memberById],
  );
  const projectOf = useCallback((t: Task) => projectById.get(t.project_id), [projectById]);

  const topLevel = useMemo(() => tasks.filter((t) => !t.parent_id).sort(byPosition), [tasks]);
  const visible = topLevel.filter((t) => !onlyMine || assignees.some((a) => a.task_id === t.id && a.user_id === currentUserId));
  const subtasksOf = (id: string) => tasks.filter((t) => t.parent_id === id).sort(byPosition);
  const milestoneName = (id: string | null) => milestones.find((m) => m.id === id)?.name ?? "";

  const counts = { todo: 0, doing: 0, review: 0, done: 0 } as Record<TaskStatus, number>;
  topLevel.forEach((t) => (counts[t.status] += 1));
  const openTask = tasks.find((t) => t.id === openId) ?? null;

  // Mehrere Aufgaben auf einmal bearbeiten
  const selection = useSelection(useMemo(() => visible.map((t) => t.id), [visible]));
  const bulk = useBulkActions({ supabase, tasks, setTasks, assignees, setAssignees, offerUndo, fail, reload });
  const canSelect = !readOnly;

  const columns: BoardColumn[] =
    view === "status"
      ? STATUSES.map((s) => ({ key: s.id, title: s.label, status: s.id }))
      : projects.map((p) => ({ key: p.id, title: p.name, projectId: p.id, href: `/p/${p.id}` }));

  const tasksOf = (col: BoardColumn) =>
    visible.filter((t) => (col.status ? t.status === col.status : t.project_id === col.projectId));

  function moveTask(taskId: string, col: BoardColumn, beforeId: string | null) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (col.projectId && col.projectId !== task.project_id) {
      setError("Aufgaben bleiben in ihrem Projekt. Zum Verschieben in ein anderes Projekt bitte das Projekt öffnen.");
      return;
    }
    const others = tasksOf(col).filter((t) => t.id !== taskId);
    const patch: Partial<Task> = { position: positionBetween(others, beforeId) };
    if (col.status) patch.status = col.status;
    updateTask(taskId, patch);
    if (patch.status && patch.status !== task.status && !(patch.status === "done" && task.recurrence)) {
      offerUndo(`„${short(task.title)}“ nach „${col.title}“ verschoben`, () => updateTask(task.id, { position: task.position, status: task.status }));
    }
  }

  // Abhaken mit "Rückgängig" (nicht bei wiederkehrenden Aufgaben – dort entsteht beim Erledigen gleich die nächste)
  function toggleDone(t: Task) {
    const next = t.status === "done" ? "todo" : "done";
    updateTask(t.id, { status: next });
    if (next === "done" && t.recurrence) return;
    offerUndo(next === "done" ? `„${short(t.title)}“ erledigt` : `„${short(t.title)}“ wieder offen`, () => updateTask(t.id, { status: t.status }));
  }

  // ---------------------------------------------------------------- UI
  return (
    <div className="px-4 sm:px-7 py-6 flex flex-col gap-6 [body[data-bulk]_&]:pb-44">
      <header data-panel className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <Link
            href={`/w/${props.workspace.id}`}
            className="self-start text-sm font-semibold text-(--c-muted) hover:text-(--c-ink) hover:underline underline-offset-4"
          >
            ← {props.workspace.name}
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">{rubric.name}</h1>
          <p className="text-(--c-muted)">
            Rubrik mit {projects.length} {projects.length === 1 ? "Projekt" : "Projekten"}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 min-w-56">
          <span className="text-sm font-semibold text-(--c-muted)">
            {counts.done} von {topLevel.length} erledigt
          </span>
          <StatusBar counts={counts} />
        </div>
      </header>

      {projects.length > 0 && (
        <nav aria-label="Projekte in dieser Rubrik" className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="inline-flex items-center gap-2 min-h-10 rounded-full bg-(--c-surface) border border-(--c-line) px-3.5 text-sm font-semibold hover:border-(--c-line-hover)"
            >
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      {undoToast}
      {canSelect && (
        <BulkBar sel={selection} visibleIds={visible.map((t) => t.id)} tasks={tasks} members={members} assignees={assignees} actions={bulk} />
      )}
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg bg-(--c-danger-soft) text-(--c-danger) px-4 py-3 text-sm font-semibold">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto underline min-h-11">
            Schließen
          </button>
        </div>
      )}

      {projects.length === 0 ? (
        <p className="rounded-xl bg-(--c-surface) border border-(--c-line) px-5 py-8 text-(--c-muted)">
          In dieser Rubrik sind noch keine Projekte. Zieh in der Übersicht Projekte hierher.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div data-panel="bar" className="flex flex-wrap items-center justify-between gap-3 border-b border-(--c-line)">
            <div role="group" aria-label="Ansicht" className="flex gap-1">
              {(
                [
                  ["projects", "Board · Projekte"],
                  ["status", "Board · Status"],
                  ["list", "Liste"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`min-h-11 px-3.5 font-bold text-sm -mb-px border-b-[3px] ${
                    view === v ? "border-(--c-accent) text-(--c-ink)" : "border-transparent text-(--c-muted) hover:text-(--c-ink)"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 pb-1">
              {canSelect && <SelectToggle sel={selection} />}
              <label className="flex items-center gap-2 text-sm font-semibold min-h-11 cursor-pointer">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="size-4 accent-(--c-accent)" />
                Nur meine Aufgaben
              </label>
            </div>
          </div>

          {view === "projects" && (
            <div data-panel="slim" className="flex justify-end">
              <StatusLegend />
            </div>
          )}

          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex-[999_1_560px] min-w-0">
              {view === "list" ? (
                <TaskList
                  tasks={visible}
                  sections={sections}
                  subtasksOf={subtasksOf}
                  peopleOf={peopleOf}
                  milestoneName={milestoneName}
                  openId={openId}
                  onOpen={(id) => setOpenId(openId === id ? null : id)}
                  projectOf={projectOf}
                  selection={canSelect ? selection : undefined}
                />
              ) : (
                <Board
                  columns={columns}
                  tasksOf={tasksOf}
                  colorful={view === "projects"}
                  openId={openId}
                  subtasksOf={subtasksOf}
                  peopleOf={peopleOf}
                  milestoneName={milestoneName}
                  projectOf={view === "status" ? projectOf : undefined}
                  attachmentsOf={(id) => attachCounts[id] ?? 0}
                  onOpen={(id) => setOpenId(openId === id ? null : id)}
                  onToggleDone={toggleDone}
                  onMove={moveTask}
                  readOnly={readOnly}
                  onQuickAdd={view === "projects" && !readOnly ? (col) => (col.projectId ? createAndOpen(col.projectId) : undefined) : undefined}
                  selection={canSelect ? selection : undefined}
                />
              )}
            </div>

            {openTask && (
              <TaskDetail
                key={openTask.id}
                task={openTask}
                subtasks={subtasksOf(openTask.id)}
                milestones={milestones.filter((m) => m.project_id === openTask.project_id)}
                sections={sections.filter((s) => s.project_id === openTask.project_id).sort(byPosition)}
                members={members}
                assigned={peopleOf(openTask.id).map((m) => m.id)}
                currentUserId={currentUserId}
                role={role}
                fresh={openTask.id === freshId}
                onClose={closeDetail}
                onUpdate={updateTask}
                onAddSubtask={(title) => addTask(openTask.project_id, title, { parent_id: openTask.id })}
                onDelete={deleteTask}
                onToggleAssignee={(uid) => toggleAssignee(openTask.id, uid)}
              onAttachmentCount={setAttachCount}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
