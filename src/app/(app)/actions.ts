"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_COLORS, roleLabel } from "@/lib/labels";
import type { WorkspaceRole } from "@/lib/database.types";

export async function createProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "") || null;
  if (!name || !workspaceId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ans Ende der Rubrik (bzw. "ohne Rubrik") stellen
  let last = supabase.from("projects").select("position").eq("workspace_id", workspaceId);
  last = sectionId ? last.eq("section_id", sectionId) : last.is("section_id", null);
  const { data: lastRow } = await last.order("position", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      workspace_id: workspaceId,
      section_id: sectionId,
      position: (lastRow?.position ?? 0) + 1,
      color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error("Projekt konnte nicht angelegt werden: " + error.message);
  revalidatePath("/", "layout");
  redirect(`/p/${data.id}`);
}

export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const workspace = String(formData.get("workspace") ?? "").trim() || "Beruflich";
  if (!name) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    org_name: name,
    first_workspace: workspace,
  });
  if (error) throw new Error("Firma konnte nicht angelegt werden: " + error.message);
  revalidatePath("/", "layout");
  redirect("/");
}

export type MemberFormState = { ok: boolean; message: string } | null;

export async function addMember(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const r = String(formData.get("role") ?? "editor");
  const role: WorkspaceRole = r === "viewer" || r === "commenter" ? r : "editor";
  if (!email || !workspaceId) return { ok: false, message: "Bitte eine E-Mail-Adresse eingeben." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_member_by_email", { ws: workspaceId, member_email: email, member_role: role });

  if (error) return { ok: false, message: error.message };
  if (data === "not_found") {
    return {
      ok: false,
      message: `${email} ist noch nicht registriert. Bitte die Person, sich zuerst selbst ein Konto anzulegen, und versuche es dann erneut.`,
    };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `${email} wurde hinzugefügt (${roleLabel(role)}).` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
