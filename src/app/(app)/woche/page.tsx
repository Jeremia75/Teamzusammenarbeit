import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyWeek, type WeekTask } from "@/components/my-week";

export const metadata = { title: "Meine Woche · Projektraum" };

// Alle Aufgaben, für die ich verantwortlich bin (oder die ich angelegt habe und niemandem zugeteilt sind) – über alle Projekte
export default async function WeekPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cols = "id, title, status, priority, start_date, due_date, parent_id, project_id, recurrence, projects!inner(name, color, archived_at), parent:parent_id(title)";
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [{ data: mine }, { data: created }] = await Promise.all([
    supabase.from("tasks").select(`${cols}, task_assignees!inner(user_id)`).eq("task_assignees.user_id", user.id).is("projects.archived_at", null).or(`status.neq.done,completed_at.gte.${since}`).limit(500),
    supabase.from("tasks").select(`${cols}, task_assignees(user_id)`).eq("created_by", user.id).is("projects.archived_at", null).or(`status.neq.done,completed_at.gte.${since}`).limit(500),
  ]);

  const map = new Map<string, WeekTask>();
  for (const t of [...(mine ?? []), ...(created ?? []).filter((t) => t.task_assignees.length === 0)]) {
    map.set(t.id, {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      start_date: t.start_date,
      due_date: t.due_date,
      project_id: t.project_id,
      project: t.projects.name,
      color: t.projects.color,
      parent: (t.parent as { title: string } | null)?.title ?? null,
      recurrence: t.recurrence,
    });
  }
  return <MyWeek initial={[...map.values()]} />;
}
