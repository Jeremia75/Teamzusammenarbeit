import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadEditableProjects, loadWorkspaces } from "@/lib/queries";
import { ProtocolReview } from "@/components/protocol-review";

export const metadata = { title: "Protokoll prüfen · Projektraum" };

export default async function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: imp }, projects, ws] = await Promise.all([
    supabase.from("protocol_imports").select("*").eq("id", id).maybeSingle(),
    loadEditableProjects(),
    loadWorkspaces(),
  ]);
  if (!imp) notFound();
  // Bereiche, in denen ich neue Projekte anlegen darf
  const workspaces = ws.filter((w) => w.myRole === "editor").map((w) => ({ id: w.id, name: w.isPersonal ? w.name : `${w.orgName} · ${w.name}` }));
  return <ProtocolReview initial={imp} projects={projects} workspaces={workspaces} currentUserId={user?.id ?? ""} />;
}
