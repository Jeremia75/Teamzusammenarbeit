import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectView, type Member } from "@/components/project-view";
import { myProjectRole } from "@/lib/queries";
import type { Guest } from "@/components/project-share";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from("projects")
    .select("*, workspaces(name, organization_id, organizations(is_personal))")
    .eq("id", projectId)
    .maybeSingle();

  // Kein Zugriff oder nicht vorhanden – RLS liefert in beiden Fällen nichts
  if (!project) notFound();

  const [{ data: tasks }, { data: milestones }, { data: sections }, { data: memberRows }, { data: myRole }, role, { data: guestRows }] = await Promise.all([
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
    myProjectRole(supabase, project.id, project.workspace_id, project.workspaces?.organization_id ?? "", user?.id ?? ""),
    supabase.from("project_members").select("user_id, role").eq("project_id", projectId),
  ]);
  const isAdmin = myRole?.role === "owner" || myRole?.role === "admin";
  const isPersonal = project.workspaces?.organizations?.is_personal ?? false;
  // Löschen dürfen: wer das Projekt angelegt hat, und Admins (gleiche Regel wie in der Datenbank)
  const canDelete = project.created_by === user?.id || myRole?.role === "owner" || myRole?.role === "admin";

  const taskIds = (tasks ?? []).map((t) => t.id);
  const { data: assignees } = taskIds.length
    ? await supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds)
    : { data: [] };

  // Wer hier mitarbeitet: Mitglieder des Bereichs und Gäste dieses Projekts
  const memberIds = [...new Set([...(memberRows ?? []).map((m) => m.user_id), ...(guestRows ?? []).map((g) => g.user_id)])];
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("*").in("id", memberIds)
    : { data: [] };

  const members: Member[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name || "Unbenannt",
    color: p.avatar_color,
  }));

  const wsIds = new Set((memberRows ?? []).map((m) => m.user_id));
  const guests: Guest[] = (guestRows ?? []).map((g) => {
    const m = members.find((x) => x.id === g.user_id);
    return { id: g.user_id, name: m?.name ?? "Unbenannt", color: m?.color ?? "#8A94A0", role: g.role, alsoMember: wsIds.has(g.user_id) };
  });

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
      share={!isPersonal && isAdmin ? { guests } : undefined}
    />
  );
}
