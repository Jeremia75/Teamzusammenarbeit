import Link from "next/link";
import type { ProjectStats, SidebarWorkspace } from "@/lib/queries";
import { ProjectBoard } from "@/components/project-board";
import { EMPTY_STATS } from "@/components/project-tile";
import { MemberManager, type ManagedMember } from "@/components/member-form";
import { roleLabel } from "@/lib/labels";
import { Avatar } from "@/components/avatar";

export type MemberInfo = ManagedMember;

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
      <div data-panel className="flex flex-wrap items-end justify-between gap-3">
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
            {ws.myRole !== "editor" && (
              <span className="ml-1 rounded-full bg-(--c-hover) px-2.5 py-1 text-xs font-bold text-(--c-text-2)" title="Deine Rolle in diesem Bereich">
                Du: {roleLabel(ws.myRole)}
              </span>
            )}
          </span>
        )}
      </div>

      <ProjectBoard
        workspaceId={ws.id}
        initialProjects={ws.projects}
        initialSections={ws.sections}
        stats={Object.fromEntries(ws.projects.map((p) => [p.id, stats.get(p.id) ?? EMPTY_STATS]))}
        readOnly={ws.myRole !== "editor"}
      />

      {!ws.isPersonal && canManage && (
        <details className="bg-(--c-surface) border border-(--c-line) rounded-xl px-4 py-3">
          <summary className="min-h-9 flex items-center cursor-pointer text-sm font-semibold">Mitglieder verwalten</summary>
          <div className="pt-3">
            <MemberManager workspaceId={ws.id} members={members} currentUserId={currentUserId} />
          </div>
        </details>
      )}
    </section>
  );
}
