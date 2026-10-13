import { createClient } from "@/lib/supabase/server";

export type SidebarWorkspace = {
  id: string;
  name: string;
  color: string;
  organizationId: string;
  orgName: string;
  isPersonal: boolean;
  projects: { id: string; name: string; color: string }[];
};

export type ProjectStats = {
  todo: number;
  doing: number;
  review: number;
  done: number;
  overdue: number;
  next: { title: string; due: string } | null;
};

/** Kennzahlen je Projekt (nur Hauptaufgaben, keine Unteraufgaben). */
export async function loadProjectStats(projectIds: string[]): Promise<Map<string, ProjectStats>> {
  const stats = new Map<string, ProjectStats>();
  if (projectIds.length === 0) return stats;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("project_id, title, status, due_date")
    .in("project_id", projectIds)
    .is("parent_id", null);
  if (error) throw new Error(error.message);

  const today = new Date().toISOString().slice(0, 10);
  for (const id of projectIds) stats.set(id, { todo: 0, doing: 0, review: 0, done: 0, overdue: 0, next: null });
  for (const t of data ?? []) {
    const s = stats.get(t.project_id)!;
    s[t.status] += 1;
    if (t.status !== "done" && t.due_date) {
      if (t.due_date < today) s.overdue += 1;
      else if (!s.next || t.due_date < s.next.due) s.next = { title: t.title, due: t.due_date };
    }
  }
  return stats;
}

/** Alles, was die Übersichtsseiten brauchen: Bereiche, Kennzahlen, Mitglieder, Admin-Rechte. */
export async function loadOverview() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspaces = await loadWorkspaces();
  const stats = await loadProjectStats(workspaces.flatMap((w) => w.projects.map((p) => p.id)));

  const shared = workspaces.filter((w) => !w.isPersonal);
  const [{ data: wsMembers }, { data: myRoles }] = await Promise.all([
    shared.length
      ? supabase.from("workspace_members").select("workspace_id, user_id").in("workspace_id", shared.map((w) => w.id))
      : Promise.resolve({ data: [] as { workspace_id: string; user_id: string }[] }),
    supabase.from("organization_members").select("organization_id, role").eq("user_id", user?.id ?? ""),
  ]);
  const ids = [...new Set((wsMembers ?? []).map((m) => m.user_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, display_name, avatar_color").in("id", ids)
    : { data: [] as { id: string; display_name: string; avatar_color: string }[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const membersOf = (wsId: string) =>
    (wsMembers ?? [])
      .filter((m) => m.workspace_id === wsId)
      .map((m) => ({
        id: m.user_id,
        name: byId.get(m.user_id)?.display_name || "Unbenannt",
        color: byId.get(m.user_id)?.avatar_color ?? "#8A94A0",
      }));
  const isAdmin = (orgId: string) =>
    (myRoles ?? []).some((r) => r.organization_id === orgId && (r.role === "owner" || r.role === "admin"));

  return { userId: user?.id ?? "", workspaces, stats, membersOf, isAdmin };
}

/** Alle Bereiche, auf die der Nutzer Zugriff hat – private zuerst. */
export async function loadWorkspaces(): Promise<SidebarWorkspace[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, color, organization_id, organizations(name, is_personal), projects(id, name, color, archived_at)")
    .order("created_at");

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((w) => ({
      id: w.id,
      name: w.name,
      color: w.color,
      organizationId: w.organization_id,
      orgName: w.organizations?.name ?? "",
      isPersonal: w.organizations?.is_personal ?? false,
      projects: (w.projects ?? [])
        .filter((p) => !p.archived_at)
        .sort((a, b) => a.name.localeCompare(b.name, "de"))
        .map((p) => ({ id: p.id, name: p.name, color: p.color })),
    }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal));
}
