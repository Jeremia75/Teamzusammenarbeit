"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Tastenkürzel für die ganze App.
 *
 * Einfache Tasten (N, /, ?, G dann …) gelten nur, wenn gerade nicht in ein Feld
 * getippt wird und kein Fenster offen ist. Strg+K (Suche) und Strg+Z (Rückgängig)
 * liegen in search.tsx bzw. undo.tsx.
 *
 * "N" schickt das Ereignis "projektraum:new-task". Eine Ansicht, die damit etwas
 * anfangen kann (Projekt, Rubrik), ruft preventDefault() auf; sonst erscheint ein Hinweis.
 */

export const NEW_TASK_EVENT = "projektraum:new-task";
export const OPEN_SEARCH_EVENT = "projektraum:open-search";
export const SHOW_SHORTCUTS_EVENT = "projektraum:shortcuts";

/** Detail des Ereignisses "projektraum:new-task": eine Ansicht kann statt anzulegen einen Hinweis setzen */
export type NewTaskDetail = { hint?: string };

/** In einer Ansicht auf "N" reagieren. Die Funktion gibt einen Hinweis-Text zurück, wenn sie nichts anlegen kann. */
export function useNewTaskShortcut(handler: (() => string | void) | null) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const active = !!handler;
  useEffect(() => {
    if (!active) return;
    const on = (e: Event) => {
      const h = ref.current;
      if (!h) return;
      const hint = h();
      if (hint) (e as CustomEvent<NewTaskDetail>).detail.hint = hint;
      else e.preventDefault();
    };
    window.addEventListener(NEW_TASK_EVENT, on);
    return () => window.removeEventListener(NEW_TASK_EVENT, on);
  }, [active]);
}

const GOTO: Record<string, { href: string; label: string }> = {
  s: { href: "/", label: "Startseite" },
  w: { href: "/woche", label: "Meine Woche" },
  p: { href: "/protokolle", label: "Aus Protokollen" },
  h: { href: "/hilfe", label: "Hilfe" },
  t: { href: "/papierkorb", label: "Papierkorb" },
};

/** Wird gerade getippt (Feld, Textbereich, Auswahl, bearbeitbarer Text)? */
function typing(el: Element | null) {
  if (!el) return false;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  if (h.tagName === "TEXTAREA" || h.tagName === "SELECT") return true;
  if (h.tagName === "INPUT") {
    const type = (h as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
  }
  return false;
}

export function Shortcuts() {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [mac, setMac] = useState(false);
  const gAt = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  useEffect(() => {
    const show = (text: string) => {
      setHint(text);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(null), 4000);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (typing(document.activeElement)) return;
      if (document.querySelector("dialog[open]")) return;
      const k = e.key;

      // "G" und gleich danach ein Buchstabe: woanders hingehen
      if (gAt.current && Date.now() - gAt.current < 1500) {
        gAt.current = 0;
        const target = GOTO[k.toLowerCase()];
        if (target) {
          e.preventDefault();
          router.push(target.href);
          return;
        }
      }
      if (k === "g" || k === "G") {
        gAt.current = Date.now();
        return;
      }
      if (k === "?") {
        e.preventDefault();
        setHelp(true);
      } else if (k === "/") {
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
      } else if (k === "n" || k === "N") {
        e.preventDefault();
        const ev = new CustomEvent<NewTaskDetail>(NEW_TASK_EVENT, { cancelable: true, detail: {} });
        window.dispatchEvent(ev);
        if (!ev.defaultPrevented) show(ev.detail.hint ?? "Neue Aufgaben mit N gehen in einem Projekt oder einer Rubrik. Öffne zuerst eines davon.");
      }
    };
    const openHelp = () => setHelp(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, openHelp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHOW_SHORTCUTS_EVENT, openHelp);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, [router]);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (help && !d.open) d.showModal();
    if (!help && d.open) d.close();
  }, [help]);

  const ctrl = mac ? "⌘" : "Strg";
  const rows: [React.ReactNode, string][] = [
    [<K key="n">N</K>, "Neue Aufgabe (im Projekt oder in der Rubrik)"],
    [<><K>/</K> oder <K>{ctrl}</K> + <K>K</K></>, "Suchen"],
    [<><K>{ctrl}</K> + <K>Z</K></>, "Letzten Schritt rückgängig machen (solange die Meldung unten zu sehen ist)"],
    [<K key="esc">Esc</K>, "Offenes Fenster schließen"],
    ...Object.entries(GOTO).map(([key, g]): [React.ReactNode, string] => [<><K>G</K> dann <K>{key.toUpperCase()}</K></>, `Zu „${g.label}“ gehen`]),
    [<K key="q">?</K>, "Diese Übersicht zeigen"],
  ];

  return (
    <>
      <dialog
        ref={dlg}
        aria-labelledby="shortcuts-title"
        onClose={() => setHelp(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setHelp(false);
        }}
        className="m-auto w-[min(520px,calc(100vw-32px))] rounded-2xl border border-(--c-line) bg-(--c-surface) text-(--c-ink) p-0 backdrop:bg-black/40"
      >
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="shortcuts-title" className="text-lg font-extrabold">Tastenkürzel</h2>
            <button
              type="button"
              onClick={() => setHelp(false)}
              className="min-h-11 min-w-11 rounded-lg text-(--c-text-2) hover:bg-(--c-bg) hover:text-(--c-ink)"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-(--c-text-2)">Die einfachen Tasten wirken nur, wenn du gerade nicht in ein Feld schreibst.</p>
          <dl className="flex flex-col divide-y divide-(--c-line-soft)">
            {rows.map(([keys, text], i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <dt className="text-sm text-(--c-text-2)">{text}</dt>
                <dd className="text-sm whitespace-nowrap">{keys}</dd>
              </div>
            ))}
          </dl>
        </div>
      </dialog>
      {hint && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-20 z-50 max-w-[calc(100vw-32px)] rounded-xl bg-(--c-ink) text-(--c-surface) px-4 py-3 text-sm shadow-lg"
        >
          {hint}
        </div>
      )}
    </>
  );
}

function K({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block min-w-6 px-1.5 py-0.5 rounded-md border border-(--c-line) bg-(--c-bg) text-xs font-bold text-center font-sans">
      {children}
    </kbd>
  );
}

/** Eintrag in der Seitenleiste (nur mit Maus/Tastatur sichtbar, nicht am Handy) */
export function ShortcutsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(SHOW_SHORTCUTS_EVENT))}
      className="pointer-coarse:hidden flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-semibold text-(--c-text-2) hover:bg-(--c-bg) hover:text-(--c-ink) text-left"
    >
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9" />
      </svg>
      <span className="flex-1">Tastenkürzel</span>
      <kbd className="text-xs text-(--c-muted) font-sans">?</kbd>
    </button>
  );
}
