import Link from "next/link";
import type { ProjectStats, SidebarWorkspace } from "@/lib/queries";
import { ProjectBoard } from "@/components/project-board";
import { EMPTY_STATS } from "@/components/project-tile";
import { MemberForm } from "@/components/member-form";
import { Avatar } from "@/components/avatar";

export type MemberInfo = { id: string; name: string; color: string };

/** Ein Bereich mit allen Projekten als Kacheln. */
export function WorkspaceOverview({
  ws,
  stats,
  members,
  currentUserId,
  canManage,
}: {
  ws: SidebarWorkspace;
  stats: Map<string, ProjectStats>;
  members: MemberInfo[];
  currentUserId: string;
  canManage: boolean;
}) {
  return (
    <section aria-labelledby={`ws-${ws.id}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={`ws-${ws.id}`} className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
          <span aria-hidden className="size-3 rounded-full" style={{ background: ws.color }} />
          <Link href={`/w/${ws.id}`} className="hover:underline underline-offset-4">
            {ws.isPersonal ? ws.name : `${ws.orgName} · ${ws.name}`}
          </Link>
        </h2>
        {ws.isPersonal ? (
          <span className="text-sm font-semibold text-(--c-muted)">Nur für dich sichtbar</span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-semibold text-(--c-muted)">
            <span className="flex">
              {members.map((m) => (
                <Avatar key={m.id} member={m} size={26} className="-ml-1.5 first:ml-0 border-2 border-(--c-bg)" />
              ))}
            </span>
            {members.length} {members.length === 1 ? "Mitglied" : "Mitglieder"}
          </span>
        )}
      </div>

      <ProjectBoard
        workspaceId={ws.id}
        initialProjects={ws.projects}
        initialSections={ws.sections}
        stats={Object.fromEntries(ws.projects.map((p) => [p.id, stats.get(p.id) ?? EMPTY_STATS]))}
      />

      {!ws.isPersonal && canManage && (
        <details className="bg-(--c-surface) border border-(--c-line) rounded-xl px-4 py-3">
          <summary className="min-h-9 flex items-center cursor-pointer text-sm font-semibold">Mitglieder verwalten</summary>
          <div className="flex flex-col gap-3 pt-3">
            <ul className="flex flex-wrap gap-3">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <Avatar member={m} size={26} />
                  {m.name}
                  {m.id === currentUserId && <span className="text-(--c-muted)">(ich)</span>}
                </li>
              ))}
            </ul>
            <MemberForm workspaceId={ws.id} />
          </div>
        </details>
      )}
    </section>
  );
}
