import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RubricView } from "@/components/rubric-view";
import type { Member } from "@/components/project-view";
import { myWorkspaceRole } from "@/lib/queries";

/** Eine Projekt-Rubrik: alle Aufgaben aller Projekte darin. */
export default async function RubricPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rubric } = await supabase
    .from("project_sections")
    .select("id, name, workspace_id, workspaces(name, organization_id)")
    .eq("id", sectionId)
    .maybeSingle();

  // Kein Zugriff oder nicht vorhanden – RLS liefert in beiden Fällen nichts
  if (!rubric) notFound();

  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, name, color, position")
    .eq("section_id", sectionId)
    .is("archived_at", null)
    .order("position");
  const projects = projectRows ?? [];
  const projectIds = projects.map((p) => p.id);

  const none = { data: [] };
  const [{ data: tasks }, { data: milestones }, { data: sections }, { data: memberRows }, role] = await Promise.all([
    projectIds.length ? supabase.from("tasks").select("*").in("project_id", projectIds).order("position") : none,
    projectIds.length ? supabase.from("milestones").select("*").in("project_id", projectIds).order("position") : none,
    projectIds.length ? supabase.from("sections").select("*").in("project_id", projectIds).order("position") : none,
    supabase.from("workspace_members").select("user_id").eq("workspace_id", rubric.workspace_id),
    myWorkspaceRole(supabase, rubric.workspace_id, rubric.workspaces?.organization_id ?? "", user?.id ?? ""),
  ]);

  const taskIds = (tasks ?? []).map((t) => t.id);
  const { data: assignees } = taskIds.length
    ? await supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds)
    : none;

  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length ? await supabase.from("profiles").select("*").in("id", memberIds) : { data: [] };

  const members: Member[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name || "Unbenannt",
    color: p.avatar_color,
  }));

  return (
    <RubricView
      key={sectionId}
      currentUserId={user?.id ?? ""}
      workspace={{ id: rubric.workspace_id, name: rubric.workspaces?.name ?? "" }}
      rubric={{ id: rubric.id, name: rubric.name }}
      projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
      initialTasks={tasks ?? []}
      milestones={milestones ?? []}
      sections={sections ?? []}
      initialAssignees={assignees ?? []}
      members={members}
      role={role}
    />
  );
}
