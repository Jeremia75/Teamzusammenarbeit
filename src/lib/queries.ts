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
