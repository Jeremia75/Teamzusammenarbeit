import { createClient } from "@/lib/supabase/server";

type Workspace = {
  id: string;
  name: string;
  color: string;
  organizations: { name: string; is_personal: boolean } | null;
  projects: { id: string; name: string; color: string; archived_at: string | null }[];
};

// Erste Übersicht: alle Bereiche, auf die der Nutzer Zugriff hat, mit ihren Projekten.
// Board, Aufgabendetails und Unteraufgaben folgen als nächster Schritt.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, color, organizations(name, is_personal), projects(id, name, color, archived_at)")
    .order("name");

  const workspaces = (data ?? []) as unknown as Workspace[];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Projektraum</h1>
          <p className="text-[#5A626B]">Angemeldet als {user?.email}</p>
        </div>
      </header>

      {error && <p className="text-[#9A3412]">Fehler beim Laden: {error.message}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {workspaces.map((ws) => (
          <section key={ws.id} className="bg-white border border-[#DDE1E5] rounded-xl p-5 flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: ws.color }} />
              {ws.name}
              <span className="ml-auto text-xs font-semibold text-[#5A626B]">
                {ws.organizations?.is_personal ? "Nur du" : ws.organizations?.name}
              </span>
            </h2>
            {ws.projects.filter((p) => !p.archived_at).length === 0 ? (
              <p className="text-sm text-[#5A626B]">Noch keine Projekte.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {ws.projects
                  .filter((p) => !p.archived_at)
                  .map((p) => (
                    <li key={p.id} className="flex items-center gap-2 min-h-11">
                      <span aria-hidden className="size-2.5 rounded-sm" style={{ background: p.color }} />
                      {p.name}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
