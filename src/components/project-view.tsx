"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Milestone, Task, TaskStatus } from "@/lib/database.types";
import { STATUSES, formatDate, isOverdue, priorityOf } from "@/lib/labels";
import { Avatar } from "@/components/avatar";
import { TaskDetail } from "@/components/task-detail";
import { Milestones } from "@/components/milestones";

export type Member = { id: string; name: string; color: string };
export type Assignee = { task_id: string; user_id: string };

type Props = {
  currentUserId: string;
  workspaceName: string;
  project: { id: string; name: string; description: string; color: string };
  initialTasks: Task[];
  initialMilestones: Milestone[];
  initialAssignees: Assignee[];
  members: Member[];
};

export function ProjectView(props: Props) {
  const { project, members, currentUserId } = props;
  const supabase = useMemo(() => createClient(), []);

  const [tasks, setTasks] = useState<Task[]>(props.initialTasks);
  const [milestones, setMilestones] = useState<Milestone[]>(props.initialMilestones);
  const [assignees, setAssignees] = useState<Assignee[]>(props.initialAssignees);
  const [view, setView] = useState<"board" | "list">("board");
  const [onlyMine, setOnlyMine] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // ---------------------------------------------------------------- Daten
  const reload = useCallback(async () => {
    const [t, m] = await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", project.id).order("position"),
      supabase.from("milestones").select("*").eq("project_id", project.id).order("position"),
    ]);
    if (t.data) setTasks(t.data);
    if (m.data) setMilestones(m.data);
    const ids = (t.data ?? []).map((x) => x.id);
    if (ids.length) {
      const a = await supabase.from("task_assignees").select("task_id, user_id").in("task_id", ids);
      if (a.data) setAssignees(a.data);
    } else {
      setAssignees([]);
    }
  }, [supabase, project.id]);

  // Echtzeit: Änderungen anderer Teammitglieder sofort übernehmen
  useEffect(() => {
    const channel = supabase
      .channel(`project-${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "milestones", filter: `project_id=eq.${project.id}` }, reload)
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
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) fail("Änderung nicht gespeichert: " + error.message);
    },
    [supabase, fail],
  );

  const addTask = useCallback(
    async (title: string, extra: Partial<Task> = {}) => {
      const position = tasks.reduce((max, t) => Math.max(max, t.position), 0) + 1;
      const { data, error } = await supabase
        .from("tasks")
        .insert({ project_id: project.id, title, position, created_by: currentUserId, ...extra })
        .select()
        .single();
      if (error) return fail("Aufgabe nicht angelegt: " + error.message);
      setTasks((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data]));
      return data;
    },
    [supabase, tasks, project.id, currentUserId, fail],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id));
      if (openId === id) setOpenId(null);
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) fail("Löschen fehlgeschlagen: " + error.message);
    },
    [supabase, openId, fail],
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
      setMilestones((prev) => prev.filter((m) => m.id !== id));
      setTasks((prev) => prev.map((t) => (t.milestone_id === id ? { ...t, milestone_id: null } : t)));
      const { error } = await supabase.from("milestones").delete().eq("id", id);
      if (error) fail(error.message);
    },
    [supabase, fail],
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

  const topLevel = tasks.filter((t) => !t.parent_id);
  const visible = onlyMine
    ? topLevel.filter((t) => assignees.some((a) => a.task_id === t.id && a.user_id === currentUserId))
    : topLevel;
  const subtasksOf = (id: string) => tasks.filter((t) => t.parent_id === id);
  const milestoneName = (id: string | null) => milestones.find((m) => m.id === id)?.name ?? "";

  const doneCount = topLevel.filter((t) => t.status === "done").length;
  const pct = topLevel.length ? Math.round((doneCount / topLevel.length) * 100) : 0;
  const openTask = tasks.find((t) => t.id === openId) ?? null;

  // ---------------------------------------------------------------- UI
  return (
    <div className="px-4 sm:px-7 py-6 flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-semibold text-[#5A626B]">{props.workspaceName} / Projekt</span>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <span aria-hidden className="size-3.5 rounded" style={{ background: project.color }} />
            {project.name}
          </h1>
          {project.description && <p className="text-[#5A626B]">{project.description}</p>}
        </div>
        <div className="flex flex-col gap-1.5 min-w-48">
          <span className="text-sm font-semibold text-[#5A626B]">
            Fortschritt: {doneCount} von {topLevel.length} erledigt
          </span>
          <span className="block h-2 rounded bg-[#DDE1E5] overflow-hidden">
            <span className="block h-full rounded bg-[#1F5FBF] transition-all" style={{ width: `${pct}%` }} />
          </span>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg bg-[#FDE8E1] text-[#9A3412] px-4 py-3 text-sm font-semibold">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto underline min-h-11">
            Schließen
          </button>
        </div>
      )}

      <Milestones milestones={milestones} tasks={topLevel} onAdd={addMilestone} onDelete={deleteMilestone} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE1E5]">
        <div role="group" aria-label="Ansicht" className="flex gap-1">
          {(["board", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`min-h-11 px-4 font-bold text-sm -mb-px border-b-[3px] ${
                view === v ? "border-[#1F5FBF] text-[#16191D]" : "border-transparent text-[#5A626B]"
              }`}
            >
              {v === "board" ? "Board" : "Liste"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold min-h-11 cursor-pointer">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="size-4 accent-[#1F5FBF]" />
          Nur meine Aufgaben
        </label>
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_560px] min-w-0">
          {view === "board" ? (
            <div className="relative overflow-x-auto pb-2">
              <div className="flex gap-3.5 items-start">
                {STATUSES.map((col) => {
                  const colTasks = visible.filter((t) => t.status === col.id);
                  return (
                    <section
                      key={col.id}
                      aria-label={col.label}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragId) updateTask(dragId, { status: col.id as TaskStatus });
                        setDragId(null);
                      }}
                      className="flex-[1_0_250px] bg-[#E8EBEE] rounded-xl p-2.5 flex flex-col gap-2.5"
                    >
                      <h2 className="flex items-center gap-2 px-1.5 pt-1 text-sm font-bold">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: col.color }} />
                        {col.label}
                        <span className="ml-auto text-xs text-[#5A626B]">{colTasks.length}</span>
                      </h2>
                      {colTasks.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          subtasks={subtasksOf(t.id)}
                          people={peopleOf(t.id)}
                          milestone={milestoneName(t.milestone_id)}
                          selected={openId === t.id}
                          onOpen={() => setOpenId(openId === t.id ? null : t.id)}
                          onDragStart={() => setDragId(t.id)}
                        />
                      ))}
                      <QuickAdd onAdd={(title) => addTask(title, { status: col.id })} />
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <TaskList
              tasks={visible}
              subtasksOf={subtasksOf}
              peopleOf={peopleOf}
              milestoneName={milestoneName}
              openId={openId}
              onOpen={(id) => setOpenId(openId === id ? null : id)}
              onAdd={(title) => addTask(title)}
            />
          )}
        </div>

        {openTask && (
          <TaskDetail
            key={openTask.id}
            task={openTask}
            subtasks={subtasksOf(openTask.id)}
            milestones={milestones}
            members={members}
            assigned={peopleOf(openTask.id).map((m) => m.id)}
            currentUserId={currentUserId}
            onClose={() => setOpenId(null)}
            onUpdate={updateTask}
            onAddSubtask={(title) => addTask(title, { parent_id: openTask.id })}
            onDelete={deleteTask}
            onToggleAssignee={(uid) => toggleAssignee(openTask.id, uid)}
          />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Karten
function TaskCard({
  task,
  subtasks,
  people,
  milestone,
  selected,
  onOpen,
  onDragStart,
}: {
  task: Task;
  subtasks: Task[];
  people: Member[];
  milestone: string;
  selected: boolean;
  onOpen: () => void;
  onDragStart: () => void;
}) {
  const prio = priorityOf(task.priority);
  const subDone = subtasks.filter((s) => s.status === "done").length;
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      aria-expanded={selected}
      className={`w-full text-left bg-white rounded-lg p-3 flex flex-col gap-2.5 border-2 cursor-pointer ${
        selected ? "border-[#1F5FBF]" : "border-white hover:border-[#C9D0D6]"
      }`}
    >
      <span className="flex flex-wrap gap-1.5">
        <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: prio.bg, color: prio.fg }}>
          {prio.label}
        </span>
        {milestone && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#EEF1F4] text-[#3E4650]">{milestone}</span>
        )}
      </span>
      <span className={`font-semibold leading-snug ${task.status === "done" ? "line-through text-[#5A626B]" : ""}`}>
        {task.title}
      </span>
      <span className="flex items-center gap-3 text-xs font-semibold text-[#5A626B]">
        {task.due_date && (
          <span className={overdue ? "text-[#9A3412]" : ""}>
            {overdue ? "Überfällig: " : ""}
            {formatDate(task.due_date)}
          </span>
        )}
        {subtasks.length > 0 && (
          <span>
            {subDone}/{subtasks.length} Unteraufgaben
          </span>
        )}
        <span className="ml-auto flex">
          {people.map((p) => (
            <Avatar key={p.id} member={p} size={24} className="-ml-1.5 border-2 border-white" />
          ))}
        </span>
      </span>
    </button>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
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
      <label className="sr-only">Neue Aufgabe</label>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+ Aufgabe hinzufügen"
        className="w-full h-11 rounded-lg bg-transparent px-3 text-sm placeholder:text-[#5A626B] focus:bg-white focus:outline-2 focus:outline-[#1F5FBF]"
      />
    </form>
  );
}

// ------------------------------------------------------------------- Liste
function TaskList({
  tasks,
  subtasksOf,
  peopleOf,
  milestoneName,
  openId,
  onOpen,
  onAdd,
}: {
  tasks: Task[];
  subtasksOf: (id: string) => Task[];
  peopleOf: (id: string) => Member[];
  milestoneName: (id: string | null) => string;
  openId: string | null;
  onOpen: (id: string) => void;
  onAdd: (title: string) => void;
}) {
  const order: Record<TaskStatus, number> = { doing: 0, review: 1, todo: 2, done: 3 };
  const sorted = [...tasks].sort(
    (a, b) => order[a.status] - order[b.status] || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  );

  return (
    <div className="relative bg-white border border-[#DDE1E5] rounded-xl overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-[#5A626B]">
            <th className="px-4 py-3 font-bold">Aufgabe</th>
            <th className="px-2 py-3 font-bold">Status</th>
            <th className="px-2 py-3 font-bold">Meilenstein</th>
            <th className="px-2 py-3 font-bold">Fällig</th>
            <th className="px-2 py-3 font-bold">Unteraufg.</th>
            <th className="px-4 py-3 font-bold">Wer</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const st = STATUSES.find((s) => s.id === t.status)!;
            const subs = subtasksOf(t.id);
            return (
              <tr key={t.id} className={`border-t border-[#EEF1F4] ${openId === t.id ? "bg-[#EEF3FB]" : ""}`}>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => onOpen(t.id)}
                    className={`min-h-11 px-2 text-left font-semibold ${t.status === "done" ? "line-through text-[#5A626B]" : ""}`}
                  >
                    {t.title}
                  </button>
                </td>
                <td className="px-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: st.color }} />
                    {st.label}
                  </span>
                </td>
                <td className="px-2 text-[#3E4650]">{milestoneName(t.milestone_id)}</td>
                <td className={`px-2 whitespace-nowrap ${isOverdue(t.due_date, t.status) ? "text-[#9A3412] font-semibold" : "text-[#3E4650]"}`}>
                  {formatDate(t.due_date)}
                </td>
                <td className="px-2 text-[#3E4650]">
                  {subs.length ? `${subs.filter((s) => s.status === "done").length}/${subs.length}` : ""}
                </td>
                <td className="px-4">
                  <span className="flex pl-1.5">
                    {peopleOf(t.id).map((p) => (
                      <Avatar key={p.id} member={p} size={24} className="-ml-1.5 border-2 border-white" />
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-[#EEF1F4] p-2">
        <QuickAdd onAdd={onAdd} />
      </div>
    </div>
  );
}
