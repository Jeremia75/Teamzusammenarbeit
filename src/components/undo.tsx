"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Offer = { id: number; text: string; undo: () => void | Promise<void> };

const SHOW_MS = 8000;

/**
 * "Rückgängig" nach einer Aktion: unten eine kurze Meldung mit Knopf (wie bei Gmail).
 * Eine neue Aktion ersetzt die vorige Meldung. Strg+Z macht die letzte Aktion ebenfalls rückgängig,
 * solange die Meldung zu sehen ist (nicht beim Schreiben in einem Feld).
 */
export function useUndo() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOffer(null);
  }, []);

  const show = useCallback(
    (text: string, undo: Offer["undo"]) => {
      if (timer.current) clearTimeout(timer.current);
      const id = ++seq.current;
      setOffer({ id, text, undo });
      timer.current = setTimeout(() => setOffer((o) => (o?.id === id ? null : o)), SHOW_MS);
    },
    [],
  );

  const run = useCallback(async () => {
    const o = offer;
    if (!o) return;
    close();
    await o.undo();
  }, [offer, close]);

  useEffect(() => {
    if (!offer) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      void run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offer, run]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const toast = offer ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-50 bottom-4 left-1/2 -translate-x-1/2 w-[min(480px,calc(100%-24px))] flex items-center gap-3 rounded-xl bg-(--c-ink) text-(--c-on-ink) pl-4 pr-2 py-2 shadow-2xl"
    >
      <span className="flex-1 min-w-0 text-sm font-semibold truncate">{offer.text}</span>
      <button type="button" onClick={() => void run()} className="min-h-11 px-3 rounded-lg text-sm font-bold underline underline-offset-4 hover:bg-white/10">
        Rückgängig
      </button>
      <button type="button" aria-label="Meldung schließen" onClick={close} className="size-11 rounded-lg text-lg opacity-70 hover:opacity-100 hover:bg-white/10">
        ×
      </button>
    </div>
  ) : null;

  return { offerUndo: show, undoToast: toast };
}

/** Kurzer Titel für die Meldung */
export const short = (title: string) => (title.length > 40 ? title.slice(0, 38) + "…" : title);
