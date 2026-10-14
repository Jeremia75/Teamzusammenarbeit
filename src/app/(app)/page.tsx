import { loadOverview } from "@/lib/queries";
import { createOrganization } from "./actions";
import { WorkspaceOverview } from "@/components/workspace-overview";
import { StatusLegend } from "@/components/status-bar";

export default async function Home() {
  const { userId, workspaces, stats, membersOf, isAdmin } = await loadOverview();
  const hasCompany = workspaces.some((w) => !w.isPersonal);
  const totalProjects = workspaces.reduce((n, w) => n + w.projects.length, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-7 py-8 flex flex-col gap-10">
      <header data-panel className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Übersicht</h1>
          <p className="text-(--c-muted)">
            {totalProjects === 0
              ? "Lege dein erstes Projekt an."
              : `${totalProjects} ${totalProjects === 1 ? "Projekt" : "Projekte"} in ${workspaces.length} ${workspaces.length === 1 ? "Bereich" : "Bereichen"}.`}
          </p>
        </div>
        <StatusLegend />
      </header>

      {workspaces.map((ws) => (
        <WorkspaceOverview
          key={ws.id}
          ws={ws}
          stats={stats}
          members={membersOf(ws.id)}
          currentUserId={userId}
          canManage={!ws.isPersonal && isAdmin(ws.organizationId)}
        />
      ))}

      {!hasCompany && (
        <section className="bg-(--c-surface) border border-(--c-line) rounded-xl p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold">Firma anlegen</h2>
            <p className="text-sm text-(--c-muted)">
              Für die Zusammenarbeit im Team. Deine privaten Projekte bleiben davon getrennt.
            </p>
          </div>
          <form action={createOrganization} className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1 text-sm font-semibold flex-[1_1_200px]">
              Name der Firma
              <input name="name" required className="h-11 rounded-lg border border-(--c-line) px-3 font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold flex-[1_1_160px]">
              Erster Bereich
              <input name="workspace" defaultValue="Beruflich" className="h-11 rounded-lg border border-(--c-line) px-3 font-normal" />
            </label>
            <button type="submit" className="h-11 px-5 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold">
              Anlegen
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
