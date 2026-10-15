"use client";

// Gemeinsame Bausteine für Zeitpläne (Projekt-Zeitplan und Bereichs-Übersicht):
// Datumsrechnung, Zoom, Kopfzeilen mit Monaten/Tagen, Hintergrund mit Heute-Linie und Zeilen.

import { forwardRef, useEffect, useState } from "react";

export type Zoom = "week" | "month" | "quarter" | "year";
export const DAY_W: Record<Zoom, number> = { week: 36, month: 14, quarter: 5, year: 2 };
export const ZOOM_LABEL: Record<Zoom, string> = { week: "Wochen", month: "Monate", quarter: "Quartal", year: "Jahr" };
export const ROW = 40;
export const MONTHS = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const LABEL_W = "w-[120px] sm:w-[220px]";

// ---- Tage als ganze Zahlen (UTC, ohne Sommerzeit-Sprünge) ----
export const toDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
export const toIso = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
export const dateOf = (day: number) => new Date(day * 86400000);
export const todayDay = () => {
  const n = new Date();
  return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000);
};
export const fmt = (day: number) => {
  const d = dateOf(day);
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
};
export const weekday = (day: number) => (dateOf(day).getUTCDay() + 6) % 7; // 0 = Montag

/** Sichtbarer Zeitraum: alle Termine + heute, mit Luft, ab Montag */
export function rangeOf(days: number[], today: number, zoom: Zoom): [number, number] {
  const all = [today, ...days];
  let a = Math.min(...all) - (zoom === "year" || zoom === "quarter" ? 14 : 7);
  a -= weekday(a);
  const min = { week: 42, month: 90, quarter: 180, year: 400 }[zoom];
  const b = Math.max(Math.max(...all) + (zoom === "year" ? 60 : 21), a + min);
  return [a, b];
}

/** Zoomstufe merken (nur in diesem Browser); am Handy mit einer gröberen Stufe beginnen */
export function useZoom(key: string, zooms: Zoom[], mobile: Zoom) {
  const [zoom, setZoomState] = useState<Zoom>(zooms[0]);
  useEffect(() => {
    try {
      const z = localStorage.getItem(key) as Zoom | null;
      if (z && zooms.includes(z)) setZoomState(z);
      else if (window.innerWidth < 640) setZoomState(mobile);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const setZoom = (z: Zoom) => {
    setZoomState(z);
    try {
      localStorage.setItem(key, z);
    } catch {}
  };
  return [zoom, setZoom] as const;
}

export function ZoomBar({
  zooms,
  zoom,
  onZoom,
  onToday,
  children,
}: {
  zooms: Zoom[];
  zoom: Zoom;
  onZoom: (z: Zoom) => void;
  onToday: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div data-panel="slim" className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Zeitraum" className="flex rounded-lg border border-(--c-line) bg-(--c-surface) p-0.5">
          {zooms.map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => onZoom(z)}
              className={`min-h-9 px-3 rounded-md text-sm font-semibold ${zoom === z ? "bg-(--c-ink) text-(--c-on-ink)" : "text-(--c-text-2) hover:bg-(--c-hover)"}`}
            >
              {ZOOM_LABEL[z]}
            </button>
          ))}
        </div>
        {children}
      </div>
      <button type="button" onClick={onToday} className="min-h-9 px-3 rounded-lg border border-(--c-line) bg-(--c-surface) text-sm font-semibold hover:bg-(--c-hover)">
        Heute
      </button>
    </div>
  );
}

/** Rahmen mit Kopfzeile und Hintergrund; die Zeilen kommen als Kinder */
export const TimelineFrame = forwardRef<
  HTMLDivElement,
  { from: number; to: number; zoom: Zoom; today: number; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>
>(function TimelineFrame({ from, to, zoom, today, children, className, ...rest }, ref) {
  const dayW = DAY_W[zoom];
  const total = to - from + 1;
  const width = total * dayW;
  const x = (day: number) => (day - from) * dayW;

  const months: { start: number; days: number; label: string }[] = [];
  for (let d = from; d <= to; ) {
    const dt = dateOf(d);
    const next = Math.round(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / 86400000);
    const end = Math.min(next, to + 1);
    const short = zoom === "year" ? MONTHS[dt.getUTCMonth()] + (dt.getUTCMonth() === 0 ? ` ${dt.getUTCFullYear()}` : "") : `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
    months.push({ start: d, days: end - d, label: short });
    d = end;
  }
  const ticks: { day: number; label: string; weekend?: boolean }[] = [];
  if (zoom === "week") for (let d = from; d <= to; d++) ticks.push({ day: d, label: String(dateOf(d).getUTCDate()), weekend: weekday(d) >= 5 });
  else if (zoom === "month") for (let d = from; d <= to; d += 7) ticks.push({ day: d, label: fmt(d) });

  return (
    <div ref={ref} className={`relative overflow-x-auto rounded-xl border border-(--c-line) bg-(--c-surface) select-none ${className ?? ""}`} {...rest}>
      <div className="relative w-max min-w-full">
        <div className="flex border-b border-(--c-line)">
          <div className={`${LABEL_W} shrink-0 sticky left-0 z-20 bg-(--c-surface) border-r border-(--c-line)`} />
          <div className="relative" style={{ width }}>
            <div className="flex h-7">
              {months.map((m) => (
                <div key={m.start} className="shrink-0 border-l border-(--c-line-soft) text-xs font-bold text-(--c-text-2) leading-7 overflow-hidden" style={{ width: m.days * dayW }}>
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
                    title={zoom === "week" ? `${WD[weekday(t.day)]}, ${fmt(t.day)}` : undefined}
                    className={`absolute top-0 h-6 text-[11px] leading-6 border-l border-(--c-line-soft) ${zoom === "week" ? "text-center" : "pl-1 whitespace-nowrap"} ${
                      t.weekend ? "text-(--c-muted)" : "text-(--c-text-2)"
                    } ${t.day === today ? "font-bold text-(--c-danger)" : ""}`}
                    style={{ left: x(t.day), width: zoom === "week" ? dayW : 7 * dayW }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Hintergrund: Wochenenden, Linien, heute */}
        <div aria-hidden className="absolute inset-0 pointer-events-none flex">
          <div className={`${LABEL_W} shrink-0`} />
          <div className="relative" style={{ width }}>
            {zoom === "week" &&
              ticks.filter((t) => t.weekend).map((t) => <div key={t.day} className="absolute top-0 bottom-0 bg-(--c-bg) opacity-70" style={{ left: x(t.day), width: dayW }} />)}
            {(zoom === "week" || zoom === "month") &&
              Array.from({ length: Math.ceil(total / 7) }, (_, i) => from + i * 7).map((d) => (
                <div key={d} className="absolute top-0 bottom-0 border-l border-(--c-line-soft)" style={{ left: x(d) }} />
              ))}
            {(zoom === "quarter" || zoom === "year") &&
              months.map((m) => <div key={m.start} className="absolute top-0 bottom-0 border-l border-(--c-line-soft)" style={{ left: x(m.start) }} />)}
            <div data-today className="absolute top-0 bottom-0 border-l-2 border-(--c-danger) z-10" style={{ left: x(today) + dayW / 2 }} title={`Heute, ${fmt(today)}`} />
          </div>
        </div>

        {children}
        <div className="flex h-3">
          <div className={`${LABEL_W} shrink-0 sticky left-0 z-20 bg-(--c-surface) border-r border-(--c-line)`} />
        </div>
      </div>
    </div>
  );
});

/** Eine Zeile: Beschriftung links (bleibt beim Scrollen stehen), Inhalt rechts */
export function TimelineRow({
  label,
  children,
  onLabel,
  active,
  muted,
  sub,
}: {
  label: string;
  children: React.ReactNode;
  onLabel?: () => void;
  active?: boolean;
  muted?: boolean;
  sub?: string;
}) {
  return (
    <div className="flex border-b border-(--c-line-soft) last:border-b-0" style={{ height: ROW }}>
      <div className={`${LABEL_W} shrink-0 sticky left-0 z-20 bg-(--c-surface) border-r border-(--c-line) flex items-center`}>
        {onLabel ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={onLabel}
            className={`w-full h-full text-left px-3 text-sm hover:bg-(--c-hover) flex flex-col justify-center min-w-0 ${active ? "font-bold text-(--c-accent)" : "font-semibold"}`}
          >
            <span className="truncate">{label}</span>
            {sub && <span className="truncate text-[11px] font-normal text-(--c-muted) leading-tight">{sub}</span>}
          </button>
        ) : (
          <span className={`px-3 text-xs font-bold truncate ${muted ? "text-(--c-muted) uppercase tracking-wider" : ""}`}>{label}</span>
        )}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

/** Überschrift einer Gruppe (z. B. Rubrik oder Person) */
export function TimelineGroupHead({ name, extra }: { name: string; extra?: React.ReactNode }) {
  return (
    <div className="flex h-7 items-end border-b border-(--c-line-soft)">
      <div className={`${LABEL_W} shrink-0 sticky left-0 z-20 bg-(--c-surface) border-r border-(--c-line) h-full flex items-end gap-1.5 px-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-(--c-muted)`}>
        <span className="truncate">{name}</span>
        {extra}
      </div>
    </div>
  );
}
