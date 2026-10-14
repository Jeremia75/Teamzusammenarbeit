"use client";

// Zeitplan (Gantt) für ein Projekt: Balken von Beginn bis Fälligkeit, gruppiert nach Rubrik.
// Balken lassen sich ziehen (verschieben) und an den Rändern in der Länge ändern.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Milestone, Section, Task, TaskStatus } from "@/lib/database.types";
import { STATUSES } from "@/lib/labels";

type Zoom = "week" | "month" | "quarter";
const DAY_W: Record<Zoom, number> = { week: 36, month: 14, quarter: 5 };
const ZOOMS: [Zoom, string][] = [
  ["week", "Wochen"],
  ["month", "Monate"],
  ["quarter", "Quartal"],
];
const ROW = 40;
const MONTHS = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// ---- Tage als ganze Zahlen (UTC, ohne Sommerzeit-Sprünge) ----
const toDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const toIso = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
const dateOf = (day: number) => new Date(day * 86400000);
const todayDay = () => {
  const n = new Date();
  return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000);
};
const fmt = (day: number) => {
  const d = dateOf(day);
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
};
const weekday = (day: number) => (dateOf(day).getUTCDay() + 6) % 7; // 0 = Montag

type Span = { start: number; end: number; dueOnly: boolean };
function spanOf(t: Task): Span | null {
  if (!t.start_date && !t.due_date) return null;
  const s = toDay(t.start_date ?? t.due_date!);
  const e = toDay(t.due_date ?? t.start_date!);
  return { start: Math.min(s, e), end: Math.max(s, e), dueOnly: !t.start_date };
}

const statusLabel = (s: TaskStatus) => STATUSES.find((x) => x.id === s)!.label;

type Drag = { id: string; mode: "move" | "start" | "end"; x0: number; span: Span; moved: boolean };

export function Gantt({
  tasks,
  sections,
  milestones,
  openId,
  onOpen,
  onUpdate,
}: {
  tasks: Task[];
  sections: Section[];
  milestones: Milestone[];
  openId: string | null;
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
}) {
  const [zoom, setZoomState] = useState<Zoom>("week");
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; span: Span } | null>(null);
  const today = todayDay();

  // Zoomstufe merken (nur dieser Browser); am Handy mit "Monate" beginnen
  useEffect(() => {
    try {
      const z = localStorage.getItem("projektraum:gantt-zoom") as Zoom | null;
      if (z && z in DAY_W) setZoomState(z);
      else if (window.innerWidth < 640) setZoomState("month");
    } catch {}
  }, []);
  const setZoom = (z: Zoom) => {
    setZoomState(z);
    try {
      localStorage.setItem("projektraum:gantt-zoom", z);
    } catch {}
  };
  const dayW = DAY_W[zoom];

  const scheduled = tasks.filter((t) => spanOf(t));
  const unscheduled = tasks.filter((t) => !spanOf(t));

  // Sichtbarer Zeitraum: alle Termine + heute, mit Luft, ab Montag
  const [from, to] = useMemo(() => {
    const days = [today];
    for (const t of tasks) {
      const s = spanOf(t);
      if (s) days.push(s.start, s.end);
    }
    for (const m of milestones) if (m.due_date) days.push(toDay(m.due_date));
    let a = Math.min(...days) - 7;
    a -= weekday(a);
    const b = Math.max(Math.max(...days) + 21, a + (zoom === "quarter" ? 180 : zoom === "month" ? 90 : 42));
    return [a, b];
  }, [tasks, milestones, today, zoom]);
  const total = to - from + 1;
  const width = total * dayW;
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

  // Gruppen: je Rubrik, dann "Ohne Rubrik"
  const groups = useMemo(() => {
    const out: { id: string; name: string; tasks: Task[] }[] = [];
    const sorted = [...scheduled].sort((a, b) => spanOf(a)!.start - spanOf(b)!.start || a.position - b.position);
    if (sections.length) {
      for (const s of sections) {
        const list = sorted.filter((t) => t.section_id === s.id);
        if (list.length) out.push({ id: s.id, name: s.name, tasks: list });
      }
      const rest = sorted.filter((t) => !t.section_id || !sections.some((s) => s.id === t.section_id));
      if (rest.length) out.push({ id: "none", name: "Ohne Rubrik", tasks: rest });
    } else if (sorted.length) out.push({ id: "all", name: "", tasks: sorted });
    return out;
  }, [scheduled, sections]);

  // ---- Kopfzeilen ----
  const months: { start: number; days: number; label: string }[] = [];
  for (let d = from; d <= to; ) {
    const dt = dateOf(d);
    const next = Math.round(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / 86400000);
    const end = Math.min(next, to + 1);
    months.push({ start: d, days: end - d, label: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` });
    d = end;
  }
  const ticks: { day: number; label: string; weekend?: boolean }[] = [];
  if (zoom === "week") for (let d = from; d <= to; d++) ticks.push({ day: d, label: `${WD[weekday(d)]} ${dateOf(d).getUTCDate()}`, weekend: weekday(d) >= 5 });
  else if (zoom === "month") for (let d = from; d <= to; d += 7) ticks.push({ day: d, label: fmt(d) });

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

  const labelW = "w-[120px] sm:w-[220px]";

  return (
    <div className="flex flex-col gap-3">
      <div data-panel="slim" className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Zeitraum" className="flex rounded-lg border border-(--c-line) bg-(--c-surface) p-0.5">
          {ZOOMS.map(([z, label]) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
              className={`min-h-9 px-3 rounded-md text-sm font-semibold ${zoom === z ? "bg-(--c-ink) text-(--c-on-ink)" : "text-(--c-text-2) hover:bg-(--c-hover)"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => scrollToToday(true)} className="min-h-9 px-3 rounded-lg border border-(--c-line) bg-(--c-surface) text-sm font-semibold hover:bg-(--c-hover)">
          Heute
        </button>
      </div>

      <div
        ref={scroller}
        data-gantt
        className="relative overflow-x-auto rounded-xl border border-(--c-line) bg-(--c-surface) select-none"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          setDrag(null);
          setPreview(null);
        }}
      >
        <div className="relative w-max min-w-full">
          {/* Kopf: Monate und Tage/Wochen */}
          <div className="flex border-b border-(--c-line)">
            <div className={`${labelW} shrink-0 sticky left-0 z-20 bg-(--c-surface) border-r border-(--c-line)`} />
            <div className="relative" style={{ width }}>
              <div className="flex h-7">
                {months.map((m) => (
                  <div key={m.start} className="shrink-0 border-l border-(--c-line-soft) text-xs font-bold text-(--c-text-2) leading-7" style={{ width: m.days * dayW }}>
                    {/* Monatsname bleibt beim seitlichen Scrollen sichtbar */}
                    <span className="sticky left-[120px] sm:left-[220px] px-2 whitespace-nowrap">{m.label}</span>
                  </div>
                ))}
              </div>
              {ticks.length > 0 && (
                <div className="relative h-6 border-t border-(--c-line-soft)">
                  {ticks.map((t) => (
                    <div
                      key={t.day}
                      className={`absolute top-0 h-6 text-[11px] leading-6 border-l border-(--c-line-soft) ${zoom === "week" ? "text-center" : "pl-1"} ${t.weekend ? "text-(--c-muted)" : "text-(--c-text-2)"} ${t.day === today ? "font-bold text-(--c-danger)" : ""}`}
                      style={{ left: x(t.day), width: zoom === "week" ? dayW : 7 * dayW }}
                    >
                      {zoom === "week" ? t.label.split(" ")[1] : t.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Hintergrund: Wochenenden, Wochenlinien, heute */}
          <div aria-hidden className="absolute inset-0 pointer-events-none flex">
            <div className={`${labelW} shrink-0`} />
            <div className="relative" style={{ width }}>
              {zoom === "week" &&
                ticks.filter((t) => t.weekend).map((t) => <div key={t.day} className="absolute top-0 bottom-0 bg-(--c-bg) opacity-70" style={{ left: x(t.day), width: dayW }} />)}
              {zoom !== "quarter" &&
                Array.from({ length: Math.ceil(total / 7) }, (_, i) => from + i * 7).map((d) => (
                  <div key={d} className="absolute top-0 bottom-0 border-l border-(--c-line-soft)" style={{ left: x(d) }} />
                ))}
              {zoom === "quarter" && months.map((m) => <div key={m.start} className="absolute top-0 bottom-0 border-l border-(--c-line-soft)" style={{ left: x(m.start) }} />)}
              <div data-today className="absolute top-0 bottom-0 border-l-2 border-(--c-danger) z-10" style={{ left: x(today) + dayW / 2 }} title={`Heute, ${fmt(today)}`} />
            </div>
          </div>

          {/* Meilensteine */}
          {milestones.some((m) => m.due_date) && (
            <Row label="Meilensteine" labelW={labelW} muted>
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
            </Row>
          )}

          {groups.map((g) => (
            <div key={g.id} role="group" aria-label={g.name || "Aufgaben"}>
              {g.name && (
                <div className="flex h-7 items-end border-b border-(--c-line-soft)">
                  <div className={`${labelW} shrink-0 sticky left-0 z-20 bg-(--c-surface) border-r border-(--c-line) h-full flex items-end px-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-(--c-muted)`}>
                    <span className="truncate">{g.name}</span>
                  </div>
                </div>
              )}
              {g.tasks.map((t) => {
                const s = preview?.id === t.id ? preview.span : spanOf(t)!;
                const overdue = t.status !== "done" && s.end < today;
                const w = Math.max(dayW, (s.end - s.start + 1) * dayW);
                const label = `${t.title}: ${s.start === s.end ? fmt(s.end) : `${fmt(s.start)} bis ${fmt(s.end)}`}, ${statusLabel(t.status)}${overdue ? ", überfällig" : ""}`;
                const narrow = w < t.title.length * 6.5 + 16;
                return (
                  <Row
                    key={t.id}
                    labelW={labelW}
                    label={t.title}
                    onLabel={() => onOpen(t.id)}
                    active={openId === t.id}
                  >
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
                      <span
                        aria-hidden
                        onPointerDown={(e) => begin(e, t, "start")}
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md hover:bg-(--c-ink)/15"
                      />
                      {!narrow && <span className={`px-2 truncate ${t.status === "done" ? "line-through opacity-80" : ""}`}>{t.title}</span>}
                      <span
                        aria-hidden
                        onPointerDown={(e) => begin(e, t, "end")}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md hover:bg-(--c-ink)/15"
                      />
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
                  </Row>
                );
              })}
            </div>
          ))}

          {!groups.length && (
            <div className="flex">
              <div className={`${labelW} shrink-0 sticky left-0`} />
              <p className="py-10 px-4 text-sm text-(--c-muted)">Noch keine Aufgabe hat einen Termin. Plane unten eine ein oder trag im Aufgabenfenster Beginn und Fälligkeit ein.</p>
            </div>
          )}
          <div className="h-3" />
        </div>
      </div>

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
      </p>
    </div>
  );
}

function Row({
  label,
  labelW,
  children,
  onLabel,
  active,
  muted,
}: {
  label: string;
  labelW: string;
  children: React.ReactNode;
  onLabel?: () => void;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex border-b border-(--c-line-soft) last:border-b-0" style={{ height: ROW }}>
      <div className={`${labelW} shrink-0 sticky left-0 z-20 bg-(--c-surface) border-r border-(--c-line) flex items-center`}>
        {onLabel ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={onLabel}
            className={`w-full h-full text-left px-3 text-sm truncate hover:bg-(--c-hover) ${active ? "font-bold text-(--c-accent)" : "font-semibold"}`}
          >
            {label}
          </button>
        ) : (
          <span className={`px-3 text-xs font-bold truncate ${muted ? "text-(--c-muted) uppercase tracking-wider" : ""}`}>{label}</span>
        )}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}
