"use client";

// „Feedback geben“: kurzer Text, landet als Aufgabe im Rückmeldungs-Projekt (RPC send_feedback).

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function FeedbackButton() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setState(null);
    const page = pathname + (typeof window !== "undefined" ? window.location.search : "");
    const { error } = await supabase.rpc("send_feedback", { body: text, page, agent: navigator.userAgent });
    setBusy(false);
    if (error) return setState({ ok: false, msg: error.message });
    setText("");
    setState({ ok: true, msg: "Danke! Deine Rückmeldung ist angekommen." });
    setTimeout(() => {
      setOpen(false);
      setState(null);
    }, 1800);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-semibold text-(--c-text-2) hover:bg-(--c-bg) hover:text-(--c-ink) text-left"
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20l1-4.4A7.5 7.5 0 1 1 20 12.5z" />
          <path d="M9 11h6M9 14.5h4" />
        </svg>
        Feedback geben
      </button>
      <dialog
        ref={dlg}
        aria-labelledby="feedback-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="m-auto w-[min(520px,calc(100vw-32px))] rounded-2xl border border-(--c-line) bg-(--c-surface) text-(--c-ink) p-0 backdrop:bg-black/40"
      >
        <form onSubmit={send} className="p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="feedback-title" className="text-lg font-extrabold">Feedback geben</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Schließen"
              className="min-h-11 min-w-11 rounded-lg text-(--c-text-2) hover:bg-(--c-bg) hover:text-(--c-ink)"
            >
              ✕
            </button>
          </div>
          <label htmlFor="feedback-text" className="text-sm text-(--c-text-2)">
            Was hat dich gestört, was fehlt dir, was gefällt dir? Jede Rückmeldung hilft. Wir sehen dazu die Seite, auf der du gerade bist.
          </label>
          <textarea
            id="feedback-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            required
            minLength={3}
            maxLength={5000}
            autoFocus
            placeholder="Zum Beispiel: Ich finde nicht, wo ich …"
            className="rounded-lg border border-(--c-line) bg-(--c-surface) p-3 text-sm resize-y"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy || text.trim().length < 3} className="h-11 px-5 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold disabled:opacity-50">
              {busy ? "Wird geschickt …" : "Abschicken"}
            </button>
            {state && (
              <p role="status" className={`text-sm font-semibold ${state.ok ? "text-(--c-success-ink)" : "text-(--c-danger)"}`}>
                {state.msg}
              </p>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
