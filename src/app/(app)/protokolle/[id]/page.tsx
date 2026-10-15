import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadEditableProjects } from "@/lib/queries";
import { ProtocolReview } from "@/components/protocol-review";

export const metadata = { title: "Protokoll prüfen · Projektraum" };

export default async function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: imp }, projects] = await Promise.all([
    supabase.from("protocol_imports").select("*").eq("id", id).maybeSingle(),
    loadEditableProjects(),
  ]);
  if (!imp) notFound();
  return <ProtocolReview initial={imp} projects={projects} currentUserId={user?.id ?? ""} />;
}
