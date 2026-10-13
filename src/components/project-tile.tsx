import Link from "next/link";
import type { ProjectStats } from "@/lib/queries";
import { formatDate } from "@/lib/labels";
import { StatusBar } from "@/components/status-bar";

export const EMPTY_STATS: ProjectStats = { todo: 0, doing: 0, review: 0, done: 0, overdue: 0, next: null };

/** Projektkarte mit Statusbalken, offen/erledigt/überfällig und nächster Fälligkeit. */
export function ProjectTile({
  project,
  stats,
  compact = false,
}: {
  project: { id: string; name: string; color: string };
  stats: ProjectStats;
  compact?: boolean;
}) {
  const s = stats;
  const total = s.todo + s.doing + s.review + s.done;
  const open = total - s.done;
  return (
    <Link
      href={`/p/${project.id}`}
      draggable={false}
      className={`h-full bg-white border border-[#DDE1E5] rounded-xl flex flex-col hover:border-[#9AA4AE] hover:shadow-sm transition ${
        compact ? "p-3 gap-2" : "p-4 gap-3"
      }`}
    >
      <span className="flex items-center gap-2.5 font-bold text-[15px] leading-snug">
        <span aria-hidden className="size-3 rounded shrink-0" style={{ background: project.color }} />
        {project.name}
      </span>
      <StatusBar counts={s} height={compact ? 6 : 8} />
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
            {s.overdue > 0 && <span className="text-[#9A3412] font-semibold">{s.overdue} überfällig</span>}
          </>
        )}
      </span>
      {s.next && (
        <span className={`mt-auto text-[13px] text-[#5A626B] border-t border-[#EEF1F4] line-clamp-2 ${compact ? "pt-2" : "pt-2.5"}`}>
          Als Nächstes: <span className="text-[#16191D] font-semibold">{s.next.title}</span> · {formatDate(s.next.due)}
        </span>
      )}
    </Link>
  );
}
