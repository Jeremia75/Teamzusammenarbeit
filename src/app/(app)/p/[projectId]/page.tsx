import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectView, type Member } from "@/components/project-view";
import { myWorkspaceRole } from "@/lib/queries";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from("projects")
    .select("*, workspaces(name, organization_id)")
    .eq("id", projectId)
    .maybeSingle();

  // Kein Zugriff oder nicht vorhanden – RLS liefert in beiden Fällen nichts
  if (!project) notFound();

  const [{ data: tasks }, { data: milestones }, { data: sections }, { data: memberRows }, { data: myRole }, role] = await Promise.all([
    supabase.from("tasks").select("*").eq("project_id", projectId).order("position"),
    supabase.from("milestones").select("*").eq("project_id", projectId).order("position"),
    supabase.from("sections").select("*").eq("project_id", projectId).order("position"),
    supabase.from("workspace_members").select("user_id").eq("workspace_id", project.workspace_id),
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", project.workspaces?.organization_id ?? "")
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
    myWorkspaceRole(supabase, project.workspace_id, project.workspaces?.organization_id ?? "", user?.id ?? ""),
  ]);
  // Löschen dürfen: wer das Projekt angelegt hat, und Admins (gleiche Regel wie in der Datenbank)
  const canDelete = project.created_by === user?.id || myRole?.role === "owner" || myRole?.role === "admin";

  const taskIds = (tasks ?? []).map((t) => t.id);
  const { data: assignees } = taskIds.length
    ? await supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds)
    : { data: [] };

  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("*").in("id", memberIds)
    : { data: [] };

  const members: Member[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name || "Unbenannt",
    color: p.avatar_color,
  }));

  return (
    <ProjectView
      currentUserId={user?.id ?? ""}
      workspace={{ id: project.workspace_id, name: project.workspaces?.name ?? "" }}
      project={{ id: project.id, name: project.name, description: project.description, color: project.color }}
      initialTasks={tasks ?? []}
      initialMilestones={milestones ?? []}
      initialSections={sections ?? []}
      initialAssignees={assignees ?? []}
      members={members}
      canDelete={canDelete && role === "editor"}
      role={role}
    />
  );
}
