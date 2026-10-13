import { STATUSES } from "@/lib/labels";
import type { TaskStatus } from "@/lib/database.types";

/** Gestapelter Balken: Anteil je Status in den Statusfarben. */
export function StatusBar({
  counts,
  height = 8,
  label,
}: {
  counts: Record<TaskStatus, number>;
  height?: number;
  label?: string;
}) {
  const total = STATUSES.reduce((n, s) => n + counts[s.id], 0);
  const text =
    label ??
    (total === 0
      ? "Keine Aufgaben"
      : STATUSES.filter((s) => counts[s.id] > 0)
          .map((s) => `${counts[s.id]} ${s.label}`)
          .join(", "));
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className="flex w-full overflow-hidden rounded-full bg-[#E8EBEE]"
      style={{ height }}
    >
      {total > 0 &&
        STATUSES.map((s) =>
          counts[s.id] > 0 ? (
            <span key={s.id} style={{ width: `${(counts[s.id] / total) * 100}%`, background: s.color }} />
          ) : null,
        )}
    </span>
  );
}

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[#3E4650]" aria-label="Farblegende">
      {STATUSES.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
