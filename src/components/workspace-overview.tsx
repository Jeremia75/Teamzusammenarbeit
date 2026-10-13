import Link from "next/link";
import type { ProjectStats, SidebarWorkspace } from "@/lib/queries";
import { formatDate } from "@/lib/labels";
import { StatusBar } from "@/components/status-bar";
import { NewProjectTile } from "@/components/new-project-tile";
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
          <span className="text-sm font-semibold text-[#5A626B]">Nur für dich sichtbar</span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-semibold text-[#5A626B]">
            <span className="flex">
              {members.map((m) => (
                <Avatar key={m.id} member={m} size={26} className="-ml-1.5 first:ml-0 border-2 border-[#F2F4F5]" />
              ))}
            </span>
            {members.length} {members.length === 1 ? "Mitglied" : "Mitglieder"}
          </span>
        )}
      </div>

      <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
        {ws.projects.map((p) => {
          const s = stats.get(p.id) ?? { todo: 0, doing: 0, review: 0, done: 0, overdue: 0, next: null };
          const total = s.todo + s.doing + s.review + s.done;
          const open = total - s.done;
          return (
            <li key={p.id}>
              <Link
                href={`/p/${p.id}`}
                className="h-full bg-white border border-[#DDE1E5] rounded-xl p-4 flex flex-col gap-3 hover:border-[#9AA4AE] hover:shadow-sm transition"
              >
                <span className="flex items-center gap-2.5 font-bold text-[15px] leading-snug">
                  <span aria-hidden className="size-3 rounded shrink-0" style={{ background: p.color }} />
                  {p.name}
                </span>
                <StatusBar counts={s} />
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[#3E4650]">
                  {total === 0 ? (
                    <span className="text-[#5A626B]">Noch keine Aufgaben</span>
                  ) : (
                    <>
                      <span>
                        <strong>{open}</strong> offen
                      </span>
                      <span>
                        <strong>{s.done}</strong> erledigt
                      </span>
                      {s.overdue > 0 && (
                        <span className="text-[#9A3412] font-semibold">{s.overdue} überfällig</span>
                      )}
                    </>
                  )}
                </span>
                {s.next && (
                  <span className="mt-auto text-[13px] text-[#5A626B] border-t border-[#EEF1F4] pt-2.5 line-clamp-2">
                    Als Nächstes: <span className="text-[#16191D] font-semibold">{s.next.title}</span> · {formatDate(s.next.due)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        <li>
          <NewProjectTile workspaceId={ws.id} />
        </li>
      </ul>

      {!ws.isPersonal && canManage && (
        <details className="bg-white border border-[#DDE1E5] rounded-xl px-4 py-3">
          <summary className="min-h-9 flex items-center cursor-pointer text-sm font-semibold">Mitglieder verwalten</summary>
          <div className="flex flex-col gap-3 pt-3">
            <ul className="flex flex-wrap gap-3">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <Avatar member={m} size={26} />
                  {m.name}
                  {m.id === currentUserId && <span className="text-[#5A626B]">(ich)</span>}
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
