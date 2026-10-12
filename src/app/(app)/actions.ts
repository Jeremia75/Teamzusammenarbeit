"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_COLORS } from "@/lib/labels";

export async function createProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const workspaceId = String(formData.get("workspace_id") ?? "");
  if (!name || !workspaceId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      workspace_id: workspaceId,
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
  if (!email || !workspaceId) return { ok: false, message: "Bitte eine E-Mail-Adresse eingeben." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_member_by_email", { ws: workspaceId, member_email: email });

  if (error) return { ok: false, message: error.message };
  if (data === "not_found") {
    return {
      ok: false,
      message: `${email} ist noch nicht registriert. Bitte die Person, sich zuerst selbst ein Konto anzulegen, und versuche es dann erneut.`,
    };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `${email} wurde hinzugefügt.` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
