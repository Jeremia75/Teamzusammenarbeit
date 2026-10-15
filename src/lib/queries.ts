import { createClient } from "@/lib/supabase/server";
import type { WorkspaceRole } from "@/lib/database.types";

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * Meine Rolle in einem Bereich (gleiche Regel wie in der Datenbank):
 * Admins und Eigentümer der Organisation dürfen immer bearbeiten.
 */
export async function myWorkspaceRole(supabase: Supa, workspaceId: string, organizationId: string, userId: string): Promise<WorkspaceRole> {
  const [{ data: org }, { data: wm }] = await Promise.all([
    supabase.from("organization_members").select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
  ]);
  if (org?.role === "owner" || org?.role === "admin") return "editor";
  return wm?.role ?? "viewer";
}

const RANK: Record<WorkspaceRole, number> = { viewer: 0, commenter: 1, editor: 2 };

/** Meine Rolle in einem Projekt: die stärkere aus Bereich und Gast-Freigabe (wie in der Datenbank) */
export async function myProjectRole(supabase: Supa, projectId: string, workspaceId: string, organizationId: string, userId: string): Promise<WorkspaceRole> {
  const [ws, { data: guest }, { data: wm }, { data: org }] = await Promise.all([
    myWorkspaceRole(supabase, workspaceId, organizationId, userId),
    supabase.from("project_members").select("role").eq("project_id", projectId).eq("user_id", userId).maybeSingle(),
    supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
    supabase.from("organization_members").select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
  ]);
  const inWorkspace = !!wm || org?.role === "owner" || org?.role === "admin";
  if (!guest) return ws;
  if (!inWorkspace) return guest.role;
  return RANK[guest.role] > RANK[ws] ? guest.role : ws;
}

export type SidebarWorkspace = {
  id: string;
  name: string;
  color: string;
  organizationId: string;
  orgName: string;
  isPersonal: boolean;
  /** Meine Rolle hier – "viewer" und "commenter" dürfen nichts anlegen oder ändern */
  myRole: WorkspaceRole;
  /** Nur Gast in einzelnen Projekten dieses Bereichs (sieht nur diese) */
  isGuest: boolean;
  projects: { id: string; name: string; color: string; sectionId: string | null; position: number }[];
  sections: { id: string; name: string; position: number }[];
};

export type ProjectStats = {
  todo: number;
  doing: number;
  review: number;
  done: number;
  overdue: number;
  next: { title: string; due: string } | null;
  /** Zeitraum aller Hauptaufgaben (Beginn bzw. Fälligkeit) – für den Zeitplan */
  first?: string | null;
  last?: string | null;
  milestones?: { name: string; due: string }[];
};

/** Kennzahlen je Projekt (nur Hauptaufgaben, keine Unteraufgaben). */
export async function loadProjectStats(projectIds: string[]): Promise<Map<string, ProjectStats>> {
  const stats = new Map<string, ProjectStats>();
  if (projectIds.length === 0) return stats;
  const supabase = await createClient();
  const [{ data, error }, { data: ms }] = await Promise.all([
    supabase.from("tasks").select("project_id, title, status, start_date, due_date").in("project_id", projectIds).is("parent_id", null),
    supabase.from("milestones").select("project_id, name, due_date").in("project_id", projectIds).not("due_date", "is", null),
  ]);
  if (error) throw new Error(error.message);

  const today = new Date().toISOString().slice(0, 10);
  for (const id of projectIds) stats.set(id, { todo: 0, doing: 0, review: 0, done: 0, overdue: 0, next: null, first: null, last: null, milestones: [] });
  for (const m of ms ?? []) stats.get(m.project_id)?.milestones!.push({ name: m.name, due: m.due_date! });
  for (const t of data ?? []) {
    const s = stats.get(t.project_id)!;
    s[t.status] += 1;
    for (const d of [t.start_date, t.due_date]) {
      if (!d) continue;
      if (!s.first || d < s.first) s.first = d;
      if (!s.last || d > s.last) s.last = d;
    }
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
      ? supabase.from("workspace_members").select("workspace_id, user_id, role").in("workspace_id", shared.map((w) => w.id))
      : Promise.resolve({ data: [] as { workspace_id: string; user_id: string; role: WorkspaceRole }[] }),
    supabase.from("organization_members").select("organization_id, user_id, role").in("organization_id", [...new Set(workspaces.map((w) => w.organizationId))]),
  ]);
  const ids = [...new Set((wsMembers ?? []).map((m) => m.user_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, display_name, avatar_color").in("id", ids)
    : { data: [] as { id: string; display_name: string; avatar_color: string }[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const orgAdmin = (orgId: string, uid: string) =>
    (myRoles ?? []).some((r) => r.organization_id === orgId && r.user_id === uid && (r.role === "owner" || r.role === "admin"));
  const membersOf = (wsId: string) => {
    const orgId = workspaces.find((w) => w.id === wsId)?.organizationId ?? "";
    return (wsMembers ?? [])
      .filter((m) => m.workspace_id === wsId)
      .map((m) => ({
        id: m.user_id,
        name: byId.get(m.user_id)?.display_name || "Unbenannt",
        color: byId.get(m.user_id)?.avatar_color ?? "#8A94A0",
        role: m.role,
        isAdmin: orgAdmin(orgId, m.user_id),
      }));
  };
  const isAdmin = (orgId: string) => orgAdmin(orgId, user?.id ?? "");

  return { userId: user?.id ?? "", workspaces, stats, membersOf, isAdmin };
}

/** Alle Bereiche, auf die der Nutzer Zugriff hat – private zuerst. */
export async function loadWorkspaces(): Promise<SidebarWorkspace[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: myWs }, { data: myOrgs }] = await Promise.all([
    supabase.from("workspace_members").select("workspace_id, role").eq("user_id", user?.id ?? ""),
    supabase.from("organization_members").select("organization_id, role").eq("user_id", user?.id ?? ""),
  ]);
  const isMember = (wsId: string, orgId: string) =>
    (myOrgs ?? []).some((o) => o.organization_id === orgId && (o.role === "owner" || o.role === "admin")) ||
    (myWs ?? []).some((m) => m.workspace_id === wsId);
  const roleIn = (wsId: string, orgId: string): WorkspaceRole => {
    if ((myOrgs ?? []).some((o) => o.organization_id === orgId && (o.role === "owner" || o.role === "admin"))) return "editor";
    return (myWs ?? []).find((m) => m.workspace_id === wsId)?.role ?? "viewer";
  };
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, color, organization_id, organizations(name, is_personal), projects(id, name, color, archived_at, section_id, position), project_sections(id, name, position)")
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
      myRole: roleIn(w.id, w.organization_id),
      isGuest: !isMember(w.id, w.organization_id),
      ...boardOrder(w.projects ?? [], w.project_sections ?? []),
    }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal));
}

/** Projekte in Board-Reihenfolge: zuerst ohne Rubrik, dann je Rubrik nach Position. */
function boardOrder(
  projects: { id: string; name: string; color: string; archived_at: string | null; section_id: string | null; position: number }[],
  sections: { id: string; name: string; position: number }[],
) {
  const secs = [...sections].sort((a, b) => a.position - b.position);
  const rank = new Map(secs.map((s, i) => [s.id, i + 1]));
  const list = projects
    .filter((p) => !p.archived_at)
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      sectionId: p.section_id && rank.has(p.section_id) ? p.section_id : null,
      position: p.position,
    }))
    .sort(
      (a, b) =>
        (a.sectionId ? rank.get(a.sectionId)! : 0) - (b.sectionId ? rank.get(b.sectionId)! : 0) ||
        a.position - b.position ||
        a.name.localeCompare(b.name, "de"),
    );
  return { projects: list, sections: secs };
}
