import { createClient } from "@/lib/supabase/server";
import { loadWorkspaces } from "@/lib/queries";
import { TemplateLibrary, type LibTemplate } from "@/components/template-library";

export const metadata = { title: "Vorlagen · Projektraum" };

export default async function TemplatesPage() {
  const supabase = await createClient();
  const [workspaces, { data }] = await Promise.all([
    loadWorkspaces(),
    supabase
      .from("project_templates")
      .select("id, name, description, task_count, span_days, workspace_id, created_at")
      .is("archived_at", null)
      .order("name"),
  ]);
  const editable = workspaces.filter((w) => w.myRole === "editor" && !w.isGuest).map((w) => ({ id: w.id, name: w.name, orgName: w.orgName, isPersonal: w.isPersonal }));
  const wsName = new Map(workspaces.map((w) => [w.id, w.name]));
  const templates: LibTemplate[] = (data ?? []).map((t) => ({ ...t, workspaceName: wsName.get(t.workspace_id) ?? "" }));
  return <TemplateLibrary templates={templates} workspaces={editable} />;
}
