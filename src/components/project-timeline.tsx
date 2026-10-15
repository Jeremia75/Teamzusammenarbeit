"use client";

// Bereichs-Übersicht als Zeitplan: jedes Projekt ein Balken von der ersten bis zur letzten Aufgabe,
// eingefärbt nach Fortschritt, Meilensteine als Rauten. Ein Klick öffnet das Projekt.

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ProjectStats } from "@/lib/queries";
import { DAY_W, TimelineFrame, TimelineGroupHead, TimelineRow, ZoomBar, fmt, rangeOf, toDay, todayDay, useZoom, type Zoom } from "@/components/timeline";

const ZOOMS: Zoom[] = ["month", "quarter", "year"];

type P = { id: string; name: string; color: string };
type Col = { key: string; title: string; projects: P[] };

export function ProjectTimeline({ columns, stats }: { columns: Col[]; stats: Record<string, ProjectStats> }) {
  const router = useRouter();
  const [zoom, setZoom] = useZoom("projektraum:ws-timeline-zoom", ZOOMS, "quarter");
  const scroller = useRef<HTMLDivElement>(null);
  const today = todayDay();
  const dayW = DAY_W[zoom];

  const all = columns.flatMap((c) => c.projects);
  const dated = (p: P) => !!stats[p.id]?.first;
  const undated = all.filter((p) => !dated(p));

  const [from, to] = useMemo(() => {
    const days: number[] = [];
    for (const p of all) {
      const s = stats[p.id];
      if (s?.first) days.push(toDay(s.first), toDay(s.last!));
      for (const m of s?.milestones ?? []) days.push(toDay(m.due));
    }
    return rangeOf(days, today, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, stats, today, zoom]);
  const x = (day: number) => (day - from) * dayW;

  const scrollToToday = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, x(today) - el.clientWidth * 0.3), behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const groups = columns.map((c) => ({ ...c, projects: c.projects.filter(dated) })).filter((c) => c.projects.length);
  const showHeads = columns.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <ZoomBar zooms={ZOOMS} zoom={zoom} onZoom={setZoom} onToday={() => scrollToToday(true)} />

      <TimelineFrame ref={scroller} data-ws-timeline from={from} to={to} zoom={zoom} today={today}>
        {groups.map((g) => (
          <div key={g.key} role="group" aria-label={g.title}>
            {showHeads && <TimelineGroupHead name={g.title} />}
            {g.projects.map((p) => {
              const s = stats[p.id];
              const a = toDay(s.first!);
              const b = toDay(s.last!);
              const total = s.todo + s.doing + s.review + s.done;
              const pct = total ? Math.round((s.done / total) * 100) : 0;
              const w = Math.max(dayW * 2, (b - a + 1) * dayW);
              const late = s.overdue > 0;
              const label = `${p.name}: ${fmt(a)} bis ${fmt(b)}, ${pct} % erledigt${late ? `, ${s.overdue} überfällig` : ""}`;
              return (
                <TimelineRow key={p.id} label={p.name} sub={`${s.done} von ${total} erledigt`} onLabel={() => router.push(`/p/${p.id}`)}>
                  <Link
                    href={`/p/${p.id}`}
                    data-project-bar={p.id}
                    aria-label={label}
                    title={label}
                    className={`absolute top-2 h-6 rounded-md border overflow-hidden flex items-center ${late ? "ring-2 ring-(--c-danger)" : ""}`}
                    style={{
                      left: x(a) + 1,
                      width: w - 2,
                      borderColor: p.color,
                      background: `color-mix(in srgb, ${p.color} 16%, var(--c-surface))`,
                    }}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: `color-mix(in srgb, ${p.color} 55%, var(--c-surface))` }} />
                    <span className="relative px-2 text-xs font-bold truncate text-(--c-ink)">{w > 90 ? `${p.name} · ${pct} %` : ""}</span>
                  </Link>
                  {w <= 90 && (
                    <span aria-hidden className="absolute top-2 h-6 leading-6 text-xs font-semibold text-(--c-text-2) whitespace-nowrap pointer-events-none" style={{ left: x(a) + w + 4 }}>
                      {p.name} · {pct} %
                    </span>
                  )}
                  {(s.milestones ?? []).map((m, i) => {
                    const d = toDay(m.due);
                    return (
                      <span
                        key={i}
                        title={`Meilenstein ${m.name} · ${fmt(d)}`}
                        className="absolute top-[13px] size-3.5 rotate-45 rounded-[3px] bg-(--c-ink) border-2 border-(--c-surface) z-10 pointer-events-auto"
                        style={{ left: x(d) + dayW / 2 - 7 }}
                      >
                        <span className="sr-only">
                          Meilenstein {m.name} am {fmt(d)}
                        </span>
                      </span>
                    );
                  })}
                </TimelineRow>
              );
            })}
          </div>
        ))}
        {!groups.length && (
          <p className="py-10 px-4 text-sm text-(--c-muted) sticky left-0 max-w-xl">
            Noch kein Projekt hat Aufgaben mit Datum. Sobald Aufgaben einen Beginn oder eine Fälligkeit haben, erscheinen die Projekte hier.
          </p>
        )}
      </TimelineFrame>

      {undated.length > 0 && (
        <section data-panel aria-label="Projekte ohne Termine" className="rounded-xl border border-(--c-line) bg-(--c-surface) p-4 flex flex-col gap-2">
          <h3 className="text-sm font-extrabold">
            Ohne Termine <span className="text-(--c-muted) font-semibold">{undated.length}</span>
          </h3>
          <ul className="flex flex-wrap gap-2">
            {undated.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${p.id}`} className="inline-flex items-center gap-2 min-h-9 px-3 rounded-lg border border-(--c-line) text-sm font-semibold hover:bg-(--c-hover)">
                  <span aria-hidden className="size-2.5 rounded-sm" style={{ background: p.color }} />
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p data-panel="slim" className="text-xs text-(--c-muted)">
        Jeder Balken reicht von der ersten bis zur letzten Aufgabe mit Datum. Der dunkle Teil zeigt, wie viel erledigt ist, Rauten sind Meilensteine, rot
        umrandet heißt: Es gibt überfällige Aufgaben. Ein Klick öffnet das Projekt.
      </p>
    </div>
  );
}
