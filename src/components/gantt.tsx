"use client";

// Zeitplan (Gantt) für ein Projekt: Balken von Beginn bis Fälligkeit, gruppiert nach Rubrik oder Person.
// Balken lassen sich ziehen (verschieben) und an den Rändern in der Länge ändern.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Milestone, Section, Task, TaskStatus } from "@/lib/database.types";
import { STATUSES } from "@/lib/labels";
import {
  DAY_W,
  TimelineFrame,
  TimelineGroupHead,
  TimelineRow,
  ZoomBar,
  fmt,
  rangeOf,
  toDay,
  toIso,
  todayDay,
  useZoom,
  type Zoom,
} from "@/components/timeline";

const ZOOMS: Zoom[] = ["week", "month", "quarter"];
type GroupBy = "section" | "person";

type Span = { start: number; end: number; dueOnly: boolean };
function spanOf(t: Task): Span | null {
  if (!t.start_date && !t.due_date) return null;
  const s = toDay(t.start_date ?? t.due_date!);
  const e = toDay(t.due_date ?? t.start_date!);
  return { start: Math.min(s, e), end: Math.max(s, e), dueOnly: !t.start_date };
}

const statusLabel = (s: TaskStatus) => STATUSES.find((x) => x.id === s)!.label;

type Drag = { id: string; mode: "move" | "start" | "end"; x0: number; span: Span; moved: boolean };
type Person = { id: string; name: string };
type Group = { id: string; name: string; tasks: Task[]; person?: boolean };

export function Gantt({
  tasks,
  sections,
  milestones,
  openId,
  onOpen,
  onUpdate,
  peopleOf,
}: {
  tasks: Task[];
  sections: Section[];
  milestones: Milestone[];
  openId: string | null;
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  peopleOf: (taskId: string) => Person[];
}) {
  const [zoom, setZoom] = useZoom("projektraum:gantt-zoom", ZOOMS, "month");
  const [groupBy, setGroupByState] = useState<GroupBy>("section");
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; span: Span } | null>(null);
  const today = todayDay();

  useEffect(() => {
    try {
      if (localStorage.getItem("projektraum:gantt-group") === "person") setGroupByState("person");
    } catch {}
  }, []);
  const setGroupBy = (g: GroupBy) => {
    setGroupByState(g);
    try {
      localStorage.setItem("projektraum:gantt-group", g);
    } catch {}
  };

  const dayW = DAY_W[zoom];
  const scheduled = tasks.filter((t) => spanOf(t));
  const unscheduled = tasks.filter((t) => !spanOf(t));

  const [from, to] = useMemo(() => {
    const days: number[] = [];
    for (const t of tasks) {
      const s = spanOf(t);
      if (s) days.push(s.start, s.end);
    }
    for (const m of milestones) if (m.due_date) days.push(toDay(m.due_date));
    return rangeOf(days, today, zoom);
  }, [tasks, milestones, today, zoom]);
  const x = (day: number) => (day - from) * dayW;

  // Beim Öffnen und beim Zoomen zu "heute" springen
  const scrollToToday = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, x(today) - el.clientWidth * 0.3), behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    const sorted = [...scheduled].sort((a, b) => spanOf(a)!.start - spanOf(b)!.start || a.position - b.position);
    if (groupBy === "person") {
      // Eine Gruppe je Person; Aufgaben mit mehreren Verantwortlichen stehen bei jeder
      const people = new Map<string, Person>();
      for (const t of sorted) for (const p of peopleOf(t.id)) people.set(p.id, p);
      for (const p of [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "de")))
        out.push({ id: p.id, name: p.name, tasks: sorted.filter((t) => peopleOf(t.id).some((q) => q.id === p.id)), person: true });
      const none = sorted.filter((t) => peopleOf(t.id).length === 0);
      if (none.length) out.push({ id: "none", name: "Niemand zugeteilt", tasks: none });
    } else if (sections.length) {
      for (const s of sections) {
        const list = sorted.filter((t) => t.section_id === s.id);
        if (list.length) out.push({ id: s.id, name: s.name, tasks: list });
      }
      const rest = sorted.filter((t) => !t.section_id || !sections.some((s) => s.id === t.section_id));
      if (rest.length) out.push({ id: "none", name: "Ohne Rubrik", tasks: rest });
    } else if (sorted.length) out.push({ id: "all", name: "", tasks: sorted });
    return out;
  }, [scheduled, sections, groupBy, peopleOf]);

  // ---- Ziehen ----
  function begin(e: React.PointerEvent, t: Task, mode: Drag["mode"]) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: t.id, mode, x0: e.clientX, span: spanOf(t)!, moved: false });
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const dd = Math.round((e.clientX - drag.x0) / dayW);
    if (!drag.moved && Math.abs(e.clientX - drag.x0) < 4) return;
    const s = { ...drag.span };
    if (drag.mode === "move") {
      s.start += dd;
      s.end += dd;
    } else if (drag.mode === "start") s.start = Math.min(s.end, drag.span.start + dd);
    else s.end = Math.max(s.start, drag.span.end + dd);
    if (drag.mode === "start" && dd !== 0) s.dueOnly = false;
    setDrag({ ...drag, moved: true });
    setPreview({ id: drag.id, span: s });
  }
  function end() {
    if (!drag) return;
    const p = preview;
    if (!drag.moved) onOpen(drag.id);
    else if (p && (p.span.start !== drag.span.start || p.span.end !== drag.span.end)) save(drag.id, p.span);
    setDrag(null);
    setPreview(null);
  }
  function save(id: string, s: Span) {
    // Nur Fälligkeit und nicht in die Länge gezogen: bleibt eine reine Fälligkeit
    if (s.dueOnly && s.start === s.end) onUpdate(id, { due_date: toIso(s.end) });
    else onUpdate(id, { start_date: toIso(s.start), due_date: toIso(s.end) });
  }
  function key(e: React.KeyboardEvent, t: Task) {
    const s = spanOf(t)!;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    if (e.shiftKey) save(t.id, { ...s, end: Math.max(s.start, s.end + step), dueOnly: false });
    else save(t.id, { start: s.start + step, end: s.end + step, dueOnly: s.dueOnly });
  }

  /** Auslastung einer Person: Tage, an denen mehrere offene Aufgaben gleichzeitig laufen */
  function loadStrip(list: Task[]) {
    const open = list.filter((t) => t.status !== "done").map((t) => spanOf(t)!);
    const count = new Map<number, number>();
    for (const s of open) for (let d = s.start; d <= s.end; d++) count.set(d, (count.get(d) ?? 0) + 1);
    const segs: { start: number; end: number; n: number }[] = [];
    for (const d of [...count.keys()].sort((a, b) => a - b)) {
      const n = Math.min(count.get(d)!, 3);
      if (n < 2) continue;
      const last = segs[segs.length - 1];
      if (last && last.end === d - 1 && last.n === n) last.end = d;
      else segs.push({ start: d, end: d, n });
    }
    const peak = Math.max(0, ...count.values());
    return { segs, peak };
  }

  return (
    <div className="flex flex-col gap-3">
      <ZoomBar zooms={ZOOMS} zoom={zoom} onZoom={setZoom} onToday={() => scrollToToday(true)}>
        <div role="group" aria-label="Gruppieren nach" className="flex items-center rounded-lg border border-(--c-line) bg-(--c-surface) p-0.5">
          {(
            [
              ["section", "Nach Rubrik"],
              ["person", "Nach Person"],
            ] as const
          ).map(([g, label]) => (
            <button
              key={g}
              type="button"
              aria-pressed={groupBy === g}
              onClick={() => setGroupBy(g)}
              className={`min-h-9 px-3 rounded-md text-sm font-semibold ${groupBy === g ? "bg-(--c-ink) text-(--c-on-ink)" : "text-(--c-text-2) hover:bg-(--c-hover)"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </ZoomBar>

      <TimelineFrame
        ref={scroller}
        data-gantt
        from={from}
        to={to}
        zoom={zoom}
        today={today}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          setDrag(null);
          setPreview(null);
        }}
      >
        {/* Meilensteine */}
        {milestones.some((m) => m.due_date) && (
          <TimelineRow label="Meilensteine" muted>
            {milestones
              .filter((m) => m.due_date)
              .map((m) => {
                const d = toDay(m.due_date!);
                return (
                  <div key={m.id} className="absolute top-0 h-full flex items-center gap-1.5" style={{ left: x(d) + dayW / 2 - 7 }} title={`${m.name} · ${fmt(d)}`}>
                    <span aria-hidden className="size-3.5 rotate-45 rounded-[3px] bg-(--c-ink) shrink-0" />
                    <span className="text-xs font-semibold whitespace-nowrap">{m.name}</span>
                    <span className="sr-only">Meilenstein {m.name} am {fmt(d)}</span>
                  </div>
                );
              })}
          </TimelineRow>
        )}

        {groups.map((g) => {
          const load = g.person ? loadStrip(g.tasks) : null;
          const open = g.tasks.filter((t) => t.status !== "done").length;
          return (
            <div key={g.id} role="group" aria-label={g.name || "Aufgaben"}>
              {g.name && (
                <div className="relative">
                  <TimelineGroupHead
                    name={g.name}
                    extra={
                      groupBy === "person" ? (
                        <span className="normal-case tracking-normal font-semibold shrink-0" data-load={load?.peak ?? 0}>
                          · {open} offen
                          {load && load.peak >= 3 && <span className="text-(--c-danger)"> · viel gleichzeitig</span>}
                        </span>
                      ) : undefined
                    }
                  />
                  {/* Auslastung: gelb = 2, rot = 3 oder mehr Aufgaben gleichzeitig */}
                  {load && load.segs.length > 0 && (
                    <div aria-hidden className="absolute inset-y-0 left-[120px] sm:left-[220px] right-0 pointer-events-none">
                      {load.segs.map((s) => (
                        <div
                          key={s.start}
                          data-overload={s.n}
                          className="absolute bottom-1 h-1.5 rounded-full"
                          style={{
                            left: x(s.start),
                            width: (s.end - s.start + 1) * dayW,
                            background: s.n >= 3 ? "var(--c-danger)" : "#e0a526",
                            opacity: 0.75,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {g.tasks.map((t) => {
                const s = preview?.id === t.id ? preview.span : spanOf(t)!;
                const overdue = t.status !== "done" && s.end < today;
                const w = Math.max(dayW, (s.end - s.start + 1) * dayW);
                const label = `${t.title}: ${s.start === s.end ? fmt(s.end) : `${fmt(s.start)} bis ${fmt(s.end)}`}, ${statusLabel(t.status)}${overdue ? ", überfällig" : ""}`;
                const narrow = w < t.title.length * 6.5 + 16;
                const others = groupBy === "section" ? peopleOf(t.id).map((p) => p.name.split(" ")[0]).join(", ") : undefined;
                return (
                  <TimelineRow key={`${g.id}-${t.id}`} label={t.title} sub={others || undefined} onLabel={() => onOpen(t.id)} active={openId === t.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      data-bar={t.id}
                      aria-label={label}
                      title={`${label}\nZiehen zum Verschieben, Ränder ziehen für die Dauer`}
                      onPointerDown={(e) => begin(e, t, "move")}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? (e.preventDefault(), onOpen(t.id)) : key(e, t))}
                      className={`group absolute top-2 h-6 rounded-md border text-xs font-semibold flex items-center touch-none cursor-grab active:cursor-grabbing outline-offset-2 ${
                        s.dueOnly && s.start === s.end ? "border-dashed" : ""
                      } ${overdue ? "ring-2 ring-(--c-danger)" : ""} ${openId === t.id ? "outline-2 outline-(--c-accent)" : ""}`}
                      style={{
                        left: x(s.start) + 1,
                        width: w - 2,
                        background: `color-mix(in srgb, var(--st-${t.status}) ${t.status === "done" ? 18 : 24}%, var(--c-surface))`,
                        borderColor: `var(--st-${t.status})`,
                        color: `var(--st-${t.status}-ink)`,
                      }}
                    >
                      <span aria-hidden onPointerDown={(e) => begin(e, t, "start")} className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md hover:bg-(--c-ink)/15" />
                      {!narrow && (
                        // Beschriftung wandert beim Scrollen mit, solange sie in den Balken passt
                        <span data-bar-label className={`sticky left-[124px] sm:left-[224px] px-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${t.status === "done" ? "line-through opacity-80" : ""}`}>
                          {t.title}
                        </span>
                      )}
                      <span aria-hidden onPointerDown={(e) => begin(e, t, "end")} className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md hover:bg-(--c-ink)/15" />
                    </div>
                    {narrow && (
                      <span aria-hidden className="absolute top-2 h-6 leading-6 text-xs font-semibold text-(--c-text-2) whitespace-nowrap pointer-events-none" style={{ left: x(s.end) + dayW + 4 }}>
                        {t.title}
                      </span>
                    )}
                    {preview?.id === t.id && (
                      <span className="absolute -top-0.5 text-[11px] font-bold bg-(--c-ink) text-(--c-on-ink) rounded px-1.5 py-0.5 whitespace-nowrap z-30" style={{ left: x(s.start) }}>
                        {s.start === s.end ? fmt(s.end) : `${fmt(s.start)} – ${fmt(s.end)}`}
                      </span>
                    )}
                  </TimelineRow>
                );
              })}
            </div>
          );
        })}

        {!groups.length && (
          <p className="py-10 px-4 text-sm text-(--c-muted) sticky left-0 max-w-xl">
            Noch keine Aufgabe hat einen Termin. Plane unten eine ein oder trag im Aufgabenfenster Beginn und Fälligkeit ein.
          </p>
        )}
      </TimelineFrame>

      {unscheduled.length > 0 && (
        <section data-panel aria-label="Ohne Termin" className="rounded-xl border border-(--c-line) bg-(--c-surface) p-4 flex flex-col gap-2">
          <h3 className="text-sm font-extrabold">
            Ohne Termin <span className="text-(--c-muted) font-semibold">{unscheduled.length}</span>
          </h3>
          <ul className="flex flex-col">
            {unscheduled.map((t) => (
              <li key={t.id} className="flex items-center gap-2 border-t border-(--c-line-soft) first:border-t-0 py-1.5">
                <span aria-hidden className="size-2 rounded-full shrink-0" style={{ background: `var(--st-${t.status})` }} />
                <button type="button" onClick={() => onOpen(t.id)} className="flex-1 min-w-0 text-left text-sm font-semibold truncate min-h-9 hover:underline underline-offset-4">
                  {t.title}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(t.id, { start_date: toIso(today), due_date: toIso(today + 2) })}
                  aria-label={`${t.title} ab heute einplanen`}
                  className="shrink-0 min-h-9 px-3 rounded-lg border border-(--c-line) text-xs font-semibold hover:bg-(--c-hover)"
                >
                  Ab heute einplanen
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p data-panel="slim" className="text-xs text-(--c-muted)">
        Tipp: Balken ziehen verschiebt die Aufgabe, die Ränder ziehen ändert Beginn oder Ende. Mit der Tastatur: Pfeiltasten verschieben, mit Umschalt die
        Dauer ändern. Gestrichelt = nur ein Fälligkeitstag, rot umrandet = überfällig.
        {groupBy === "person" && " Die Linie unter einer Person zeigt, wo mehrere offene Aufgaben gleichzeitig laufen: gelb = 2, rot = 3 oder mehr."}
      </p>
    </div>
  );
}
