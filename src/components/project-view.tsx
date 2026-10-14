"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Milestone, Section, Task, TaskStatus } from "@/lib/database.types";
import { STATUSES, formatDate, isOverdue } from "@/lib/labels";
import { byPosition, positionBetween } from "@/lib/ordering";
import { Avatar } from "@/components/avatar";
import { TaskDetail } from "@/components/task-detail";
import { removeTaskFiles, useAttachmentCounts } from "@/components/attachments";
import { Milestones } from "@/components/milestones";
import { Board, QuickAdd, type BoardColumn } from "@/components/board";
import { StatusBar, StatusLegend } from "@/components/status-bar";

export type Member = { id: string; name: string; color: string };
export type Assignee = { task_id: string; user_id: string };

type Props = {
  currentUserId: string;
  workspace: { id: string; name: string };
  project: { id: string; name: string; description: string; color: string };
  initialTasks: Task[];
  initialMilestones: Milestone[];
  initialSections: Section[];
  initialAssignees: Assignee[];
  members: Member[];
};

type View = "sections" | "status" | "list";

export function ProjectView(props: Props) {
  const { project, members, currentUserId } = props;
  const supabase = useMemo(() => createClient(), []);

  const [tasks, setTasks] = useState<Task[]>(props.initialTasks);
  const [milestones, setMilestones] = useState<Milestone[]>(props.initialMilestones);
  const [sections, setSections] = useState<Section[]>(props.initialSections);
  const [assignees, setAssignees] = useState<Assignee[]>(props.initialAssignees);
  const [view, setViewState] = useState<View>(props.initialSections.length ? "sections" : "status");
  const [onlyMine, setOnlyMine] = useState(false);
  const [msFilter, setMsFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Gewählte Ansicht pro Projekt merken (nur in diesem Browser)
  const viewKey = `projektraum:view:${project.id}`;
  useEffect(() => {
    try {
      const v = localStorage.getItem(viewKey) as View | null;
      if (v === "sections" || v === "status" || v === "list") setViewState(v);
    } catch {
      /* Speicher nicht verfügbar – Standardansicht bleibt */
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

  // ---------------------------------------------------------------- Daten
  const reload = useCallback(async () => {
    // Alles parallel laden und gemeinsam setzen, damit Karten nicht ohne Zuständige aufblitzen
    const [t, m, s, a] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", project.id).order("position"),
      supabase.from("milestones").select("*").eq("project_id", project.id).order("position"),
      supabase.from("sections").select("*").eq("project_id", project.id).order("position"),
      supabase.from("task_assignees").select("task_id, user_id, tasks!inner(project_id)").eq("tasks.project_id", project.id),
    ]);
    if (t.data) setTasks(t.data);
    if (m.data) setMilestones(m.data);
    if (s.data) setSections(s.data);
    if (a.data) setAssignees(a.data.map(({ task_id, user_id }) => ({ task_id, user_id })));
  }, [supabase, project.id]);

  // Echtzeit: Änderungen anderer Teammitglieder sofort übernehmen
  useEffect(() => {
    const f = `project_id=eq.${project.id}`;
    const channel = supabase
      .channel(`project-${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: f }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "milestones", filter: f }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "sections", filter: f }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, project.id, reload]);

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
      // Bei wiederkehrenden Aufgaben legt die Datenbank die nächste an – holen
      if (patch.status === "done" && before?.recurrence && before.status !== "done") reload();
    },
    [supabase, fail, tasks, reload],
  );

  const addTask = useCallback(
    async (title: string, extra: Partial<Task> = {}) => {
      const position = tasks.reduce((max, t) => Math.max(max, t.position), 0) + 1;
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          project_id: project.id,
          title,
          position,
          created_by: currentUserId,
          milestone_id: extra.parent_id ? null : msFilter,
          ...extra,
        })
        .select()
        .single();
      if (error) return fail("Aufgabe nicht angelegt: " + error.message);
      setTasks((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data]));
      window.dispatchEvent(new Event("projektraum:task-created"));
      return data;
    },
    [supabase, tasks, project.id, currentUserId, fail, msFilter],
  );

  const attachIds = useMemo(() => [project.id], [project.id]);
  const { counts: attachCounts, setCount: setAttachCount } = useAttachmentCounts(supabase, attachIds);

  const deleteTask = useCallback(
    async (id: string) => {
      await removeTaskFiles(supabase, [id, ...tasks.filter((t) => t.parent_id === id).map((t) => t.id)]);
      setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id));
      if (openId === id) setOpenId(null);
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) fail("Löschen fehlgeschlagen: " + error.message);
    },
    [supabase, openId, fail, tasks],
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

  const addMilestone = useCallback(
    async (name: string, due: string | null) => {
      const position = milestones.reduce((max, m) => Math.max(max, m.position), 0) + 1;
      const { data, error } = await supabase
        .from("milestones")
        .insert({ project_id: project.id, name, due_date: due, position })
        .select()
        .single();
      if (error) return fail("Meilenstein nicht angelegt: " + error.message);
      setMilestones((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    },
    [supabase, milestones, project.id, fail],
  );

  const deleteMilestone = useCallback(
    async (id: string) => {
      if (msFilter === id) setMsFilter(null);
      setMilestones((prev) => prev.filter((m) => m.id !== id));
      setTasks((prev) => prev.map((t) => (t.milestone_id === id ? { ...t, milestone_id: null } : t)));
      const { error } = await supabase.from("milestones").delete().eq("id", id);
      if (error) fail(error.message);
    },
    [supabase, fail, msFilter],
  );

  // ------------------------------------------------------------ Rubriken
  const sortedSections = useMemo(() => [...sections].sort(byPosition), [sections]);

  const addSection = useCallback(
    async (name: string) => {
      const position = sortedSections.length ? sortedSections[sortedSections.length - 1].position + 1 : 1;
      const { data, error } = await supabase.from("sections").insert({ project_id: project.id, name, position }).select().single();
      if (error) return fail("Rubrik nicht angelegt: " + error.message);
      setSections((prev) => (prev.some((s) => s.id === data.id) ? prev : [...prev, data]));
    },
    [supabase, project.id, sortedSections, fail],
  );

  const renameSection = useCallback(
    async (id: string, name: string) => {
      setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
      const { error } = await supabase.from("sections").update({ name }).eq("id", id);
      if (error) fail(error.message);
    },
    [supabase, fail],
  );

  const deleteSection = useCallback(
    async (id: string) => {
      setSections((prev) => prev.filter((s) => s.id !== id));
      setTasks((prev) => prev.map((t) => (t.section_id === id ? { ...t, section_id: null } : t)));
      const { error } = await supabase.from("sections").delete().eq("id", id);
      if (error) fail(error.message);
    },
    [supabase, fail],
  );

  const shiftSection = useCallback(
    async (id: string, dir: -1 | 1) => {
      const idx = sortedSections.findIndex((s) => s.id === id);
      const other = sortedSections[idx + dir];
      if (!other) return;
      const a = sortedSections[idx];
      setSections((prev) =>
        prev.map((s) => (s.id === a.id ? { ...s, position: other.position } : s.id === other.id ? { ...s, position: a.position } : s)),
      );
      const [r1, r2] = await Promise.all([
        supabase.from("sections").update({ position: other.position }).eq("id", a.id),
        supabase.from("sections").update({ position: a.position }).eq("id", other.id),
      ]);
      if (r1.error || r2.error) fail("Reihenfolge nicht gespeichert");
    },
    [supabase, sortedSections, fail],
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

  const topLevel = useMemo(() => tasks.filter((t) => !t.parent_id).sort(byPosition), [tasks]);
  const visible = topLevel.filter(
    (t) =>
      (!msFilter || t.milestone_id === msFilter) &&
      (!onlyMine || assignees.some((a) => a.task_id === t.id && a.user_id === currentUserId)),
  );
  const subtasksOf = (id: string) => tasks.filter((t) => t.parent_id === id).sort(byPosition);
  const milestoneName = (id: string | null) => milestones.find((m) => m.id === id)?.name ?? "";
  const filterMilestone = milestones.find((m) => m.id === msFilter) ?? null;

  const counts = { todo: 0, doing: 0, review: 0, done: 0 } as Record<TaskStatus, number>;
  topLevel.forEach((t) => (counts[t.status] += 1));
  const openTask = tasks.find((t) => t.id === openId) ?? null;

  // Spalten je Ansicht
  const columns: BoardColumn[] =
    view === "status"
      ? STATUSES.map((s) => ({ key: s.id, title: s.label, status: s.id }))
      : [
          ...(sortedSections.length === 0 || visible.some((t) => !t.section_id || !sections.some((s) => s.id === t.section_id))
            ? [{ key: "none", title: "Ohne Rubrik", sectionId: null }]
            : []),
          ...sortedSections.map((s) => ({ key: s.id, title: s.name, sectionId: s.id, editable: true })),
        ];

  const tasksOf = (col: BoardColumn) =>
    visible.filter((t) =>
      col.status
        ? t.status === col.status
        : col.sectionId
          ? t.section_id === col.sectionId
          : !t.section_id || !sections.some((s) => s.id === t.section_id),
    );

  function moveTask(taskId: string, col: BoardColumn, beforeId: string | null) {
    const others = tasksOf(col).filter((t) => t.id !== taskId);
    const position = positionBetween(others, beforeId);
    const patch: Partial<Task> = { position };
    if (col.status) patch.status = col.status;
    else patch.section_id = col.sectionId ?? null;
    updateTask(taskId, patch);
  }

  function quickAdd(col: BoardColumn, title: string) {
    const last = tasksOf(col).at(-1);
    addTask(title, {
      position: last ? last.position + 1 : 1,
      ...(col.status ? { status: col.status } : { section_id: col.sectionId ?? null }),
    });
  }

  function selectMilestone(id: string | null) {
    setMsFilter(id);
    if (id) requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // ---------------------------------------------------------------- UI
  return (
    <div className="px-4 sm:px-7 py-6 flex flex-col gap-6">
      <header data-panel className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <Link href={`/w/${props.workspace.id}`} className="self-start text-sm font-semibold text-(--c-muted) hover:text-(--c-ink) hover:underline underline-offset-4">
            ← {props.workspace.name}
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <span aria-hidden className="size-3.5 rounded" style={{ background: project.color }} />
            {project.name}
          </h1>
          {project.description && <p className="text-(--c-muted) whitespace-pre-line max-w-3xl">{project.description}</p>}
        </div>
        <div className="flex flex-col gap-1.5 min-w-56">
          <span className="text-sm font-semibold text-(--c-muted)">
            {counts.done} von {topLevel.length} erledigt
          </span>
          <StatusBar counts={counts} />
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg bg-(--c-danger-soft) text-(--c-danger) px-4 py-3 text-sm font-semibold">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto underline min-h-11">
            Schließen
          </button>
        </div>
      )}

      <div data-panel>
      <Milestones
        milestones={milestones}
        tasks={topLevel}
        onAdd={addMilestone}
        onDelete={deleteMilestone}
        selectedId={msFilter}
        onSelect={selectMilestone}
      />
      </div>

      <div ref={boardRef} className="scroll-mt-4 flex flex-col gap-3">
        <div data-panel="bar" className="flex flex-wrap items-center justify-between gap-3 border-b border-(--c-line)">
          <div role="group" aria-label="Ansicht" className="flex gap-1">
            {(
              [
                ["sections", "Board · Rubriken"],
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
          <label className="flex items-center gap-2 text-sm font-semibold min-h-11 cursor-pointer">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="size-4 accent-(--c-accent)" />
            Nur meine Aufgaben
          </label>
        </div>

        {(filterMilestone || view === "sections") && (
          <div data-panel="slim" className="flex flex-wrap items-center justify-between gap-3">
            {filterMilestone ? (
              <div className="flex items-center gap-2 rounded-full bg-(--c-accent-soft) border border-(--c-accent-line-2) pl-3.5 pr-1 py-1 text-sm font-semibold text-(--c-accent-ink)">
                Meilenstein: {filterMilestone.name} · {visible.length} {visible.length === 1 ? "Aufgabe" : "Aufgaben"}
                <button
                  type="button"
                  onClick={() => setMsFilter(null)}
                  aria-label="Meilenstein-Filter aufheben"
                  className="size-8 rounded-full hover:bg-(--c-accent-soft-2) flex items-center justify-center"
                >
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ) : (
              <span />
            )}
            {view === "sections" && <StatusLegend />}
          </div>
        )}

        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex-[999_1_560px] min-w-0">
            {view === "list" ? (
              <TaskList
                tasks={visible}
                sections={sortedSections}
                subtasksOf={subtasksOf}
                peopleOf={peopleOf}
                milestoneName={milestoneName}
                openId={openId}
                onOpen={(id) => setOpenId(openId === id ? null : id)}
                onAdd={(title) => addTask(title)}
              />
            ) : (
              <Board
                columns={columns}
                tasksOf={tasksOf}
                colorful={view === "sections"}
                openId={openId}
                subtasksOf={subtasksOf}
                peopleOf={peopleOf}
                milestoneName={msFilter ? () => "" : milestoneName}
                attachmentsOf={(id) => attachCounts[id] ?? 0}
                onOpen={(id) => setOpenId(openId === id ? null : id)}
                onToggleDone={(t) => updateTask(t.id, { status: t.status === "done" ? "todo" : "done" })}
                onMove={moveTask}
                onQuickAdd={quickAdd}
                onAddSection={view === "sections" ? addSection : undefined}
                onRenameSection={renameSection}
                onDeleteSection={deleteSection}
                onShiftSection={shiftSection}
              />
            )}
          </div>

          {openTask && (
            <TaskDetail
              key={openTask.id}
              task={openTask}
              subtasks={subtasksOf(openTask.id)}
              milestones={milestones}
              sections={sortedSections}
              members={members}
              assigned={peopleOf(openTask.id).map((m) => m.id)}
              currentUserId={currentUserId}
              onClose={() => setOpenId(null)}
              onUpdate={updateTask}
              onAddSubtask={(title) => addTask(title, { parent_id: openTask.id })}
              onDelete={deleteTask}
              onToggleAssignee={(uid) => toggleAssignee(openTask.id, uid)}
              onAttachmentCount={setAttachCount}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Liste
export function TaskList({
  tasks,
  sections,
  subtasksOf,
  peopleOf,
  milestoneName,
  openId,
  onOpen,
  onAdd,
  projectOf,
}: {
  tasks: Task[];
  sections: Section[];
  subtasksOf: (id: string) => Task[];
  peopleOf: (id: string) => Member[];
  milestoneName: (id: string | null) => string;
  openId: string | null;
  onOpen: (id: string) => void;
  onAdd?: (title: string) => void;
  /** Spalte „Projekt“ zeigen (Ansicht über mehrere Projekte) */
  projectOf?: (task: Task) => { name: string; color: string } | undefined;
}) {
  const order: Record<TaskStatus, number> = { doing: 0, review: 1, todo: 2, done: 3 };
  const sorted = [...tasks].sort(
    (a, b) => order[a.status] - order[b.status] || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  );
  const sectionName = (id: string | null) => sections.find((s) => s.id === id)?.name ?? "";

  return (
    <div className="relative bg-(--c-surface) border border-(--c-line) rounded-xl overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-(--c-muted)">
            <th scope="col" className="px-4 py-3 font-bold">Aufgabe</th>
            {projectOf && <th scope="col" className="px-2 py-3 font-bold">Projekt</th>}
            <th scope="col" className="px-2 py-3 font-bold">Status</th>
            <th scope="col" className="px-2 py-3 font-bold">Rubrik</th>
            <th scope="col" className="px-2 py-3 font-bold">Meilenstein</th>
            <th scope="col" className="px-2 py-3 font-bold">Fällig</th>
            <th scope="col" className="px-2 py-3 font-bold">Unteraufg.</th>
            <th scope="col" className="px-4 py-3 font-bold">Wer</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const st = STATUSES.find((s) => s.id === t.status)!;
            const subs = subtasksOf(t.id);
            return (
              <tr key={t.id} className={`border-t border-(--c-line-soft) ${openId === t.id ? "bg-(--c-accent-soft)" : ""}`}>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => onOpen(t.id)}
                    className={`min-h-11 px-2 text-left font-semibold ${t.status === "done" ? "line-through text-(--c-muted)" : ""}`}
                  >
                    {t.title}
                    {t.recurrence && <span className="sr-only"> (wiederkehrend)</span>}
                  </button>
                </td>
                {projectOf && (
                  <td className="px-2 text-(--c-text-2)">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <span aria-hidden className="size-2 rounded-sm shrink-0" style={{ background: projectOf(t)?.color }} />
                      {projectOf(t)?.name}
                    </span>
                  </td>
                )}
                <td className="px-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: st.color }} />
                    {st.label}
                  </span>
                </td>
                <td className="px-2 text-(--c-text-2)">{sectionName(t.section_id)}</td>
                <td className="px-2 text-(--c-text-2)">{milestoneName(t.milestone_id)}</td>
                <td className={`px-2 whitespace-nowrap ${isOverdue(t.due_date, t.status) ? "text-(--c-danger) font-semibold" : "text-(--c-text-2)"}`}>
                  {formatDate(t.due_date)}
                </td>
                <td className="px-2 text-(--c-text-2)">
                  {subs.length ? `${subs.filter((s) => s.status === "done").length}/${subs.length}` : ""}
                </td>
                <td className="px-4">
                  <span className="flex pl-1.5">
                    {peopleOf(t.id).map((p) => (
                      <Avatar key={p.id} member={p} size={24} className="-ml-1.5 border-2 border-(--c-surface)" />
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {onAdd && (
        <div className="border-t border-(--c-line-soft) p-2">
          <QuickAdd onAdd={onAdd} />
        </div>
      )}
      {sorted.length === 0 && !onAdd && <p className="px-4 py-6 text-sm text-(--c-muted)">Keine Aufgaben.</p>}
    </div>
  );
}
