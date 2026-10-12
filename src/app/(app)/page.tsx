import Link from "next/link";
import { loadWorkspaces } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { createOrganization } from "./actions";
import { MemberForm } from "@/components/member-form";
import { Avatar } from "@/components/avatar";

export default async function Home() {
  const workspaces = await loadWorkspaces();
  const shared = workspaces.filter((w) => !w.isPersonal);

  // Mitglieder der geteilten Bereiche und eigene Admin-Rechte
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: wsMembers }, { data: myRoles }] = await Promise.all([
    shared.length
      ? supabase.from("workspace_members").select("workspace_id, user_id").in("workspace_id", shared.map((w) => w.id))
      : Promise.resolve({ data: [] as { workspace_id: string; user_id: string }[] }),
    supabase.from("organization_members").select("organization_id, role").eq("user_id", user?.id ?? ""),
  ]);
  const memberIds = [...new Set((wsMembers ?? []).map((m) => m.user_id))];
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, display_name, avatar_color").in("id", memberIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const isAdmin = (orgId: string) =>
    (myRoles ?? []).some((r) => r.organization_id === orgId && (r.role === "owner" || r.role === "admin"));
  const hasCompany = shared.length > 0;
  const totalProjects = workspaces.reduce((n, w) => n + w.projects.length, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-7 py-8 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Übersicht</h1>
        <p className="text-[#5A626B]">
          {totalProjects === 0
            ? "Lege links mit dem + dein erstes Projekt an."
            : `${totalProjects} ${totalProjects === 1 ? "Projekt" : "Projekte"} in ${workspaces.length} ${workspaces.length === 1 ? "Bereich" : "Bereichen"}.`}
        </p>
      </header>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        {workspaces.map((ws) => (
          <section key={ws.id} className="bg-white border border-[#DDE1E5] rounded-xl p-5 flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: ws.color }} />
              {ws.name}
              <span className="ml-auto text-xs font-semibold text-[#5A626B]">
                {ws.isPersonal ? "Nur du" : ws.orgName}
              </span>
            </h2>
            {ws.projects.length === 0 ? (
              <p className="text-sm text-[#5A626B]">Noch keine Projekte.</p>
            ) : (
              <ul className="flex flex-col">
                {ws.projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/p/${p.id}`} className="flex items-center gap-2 min-h-11 rounded-lg px-2 -mx-2 hover:bg-[#F6F7F8]">
                      <span aria-hidden className="size-2.5 rounded-sm" style={{ background: p.color }} />
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {!ws.isPersonal && (
              <div className="flex flex-col gap-3 border-t border-[#EEF1F4] pt-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#5A626B]">Mitglieder</span>
                <ul className="flex flex-col gap-2">
                  {(wsMembers ?? [])
                    .filter((m) => m.workspace_id === ws.id)
                    .map((m) => {
                      const p = profileById.get(m.user_id);
                      const name = p?.display_name || "Unbenannt";
                      return (
                        <li key={m.user_id} className="flex items-center gap-2.5 text-sm">
                          <Avatar member={{ name, color: p?.avatar_color ?? "#8A94A0" }} size={28} />
                          {name}
                          {m.user_id === user?.id && <span className="text-[#5A626B]">(ich)</span>}
                        </li>
                      );
                    })}
                </ul>
                {isAdmin(ws.organizationId) && <MemberForm workspaceId={ws.id} />}
              </div>
            )}
          </section>
        ))}
      </div>

      {!hasCompany && (
        <section className="bg-white border border-[#DDE1E5] rounded-xl p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold">Firma anlegen</h2>
            <p className="text-sm text-[#5A626B]">
              Für die Zusammenarbeit im Team. Deine privaten Projekte bleiben davon getrennt.
            </p>
          </div>
          <form action={createOrganization} className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1 text-sm font-semibold flex-[1_1_200px]">
              Name der Firma
              <input name="name" required className="h-11 rounded-lg border border-[#DDE1E5] px-3 font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold flex-[1_1_160px]">
              Erster Bereich
              <input name="workspace" defaultValue="Beruflich" className="h-11 rounded-lg border border-[#DDE1E5] px-3 font-normal" />
            </label>
            <button type="submit" className="h-11 px-5 rounded-lg bg-[#16191D] text-white font-bold">
              Anlegen
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
