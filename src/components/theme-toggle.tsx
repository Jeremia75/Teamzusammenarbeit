"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppearance } from "@/components/appearance-provider";

export const THEME_KEY = "projektraum:theme";
type Theme = "light" | "dark" | "system";

/** Läuft vor dem ersten Zeichnen, damit beim Laden nichts hell aufblitzt. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
}

const OPTIONS: { id: Theme; label: string; icon: React.ReactNode }[] = [
  {
    id: "light",
    label: "Hell",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
      </>
    ),
  },
  { id: "dark", label: "Dunkel", icon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /> },
  {
    id: "system",
    label: "Automatisch",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
  },
];

/** Umschalter Hell / Dunkel / Automatisch (wie Windows) – gemerkt auf diesem Gerät. */
export function ThemeToggle() {
  const { live } = useAppearance();
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t === "light" || t === "dark") setTheme(t);
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, []);

  function choose(t: Theme) {
    setTheme(t);
    apply(t);
    try {
      if (t === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignorieren */
    }
  }

  // Eigenes Design aktiv: Hell/Dunkel gilt dann nicht
  if (live) {
    return (
      <Link
        href="/darstellung"
        className="flex items-center justify-between gap-2 min-h-11 rounded-lg border border-(--c-line) px-3 text-xs font-semibold text-(--c-text-2) hover:text-(--c-ink)"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-full bg-(--c-accent)" />
          Eigenes Design aktiv
        </span>
        <span className="text-(--c-accent)">Ändern</span>
      </Link>
    );
  }

  return (
    <div role="radiogroup" aria-label="Darstellung" className="flex rounded-lg border border-(--c-line) p-0.5 bg-(--c-bg)">
      {OPTIONS.map((o) => {
        const on = theme === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.id === "system" ? "Automatisch: wie in Windows eingestellt" : o.label}
            onClick={() => choose(o.id)}
            className={`flex-1 min-h-11 rounded-md flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
              on ? "bg-(--c-surface) text-(--c-ink) shadow-sm" : "text-(--c-muted) hover:text-(--c-ink)"
            }`}
          >
            <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {o.icon}
            </svg>
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
