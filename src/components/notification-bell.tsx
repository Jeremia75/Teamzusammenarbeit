"use client";

// Glocke in der Seitenleiste: zeigt Benachrichtigungen (zugeteilt, erwähnt, kommentiert, erledigt) in Echtzeit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/database.types";

type Item = Notification & { tasks: { title: string; project_id: string } | null; actor: string };

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  if (s < 172800) return "gestern";
  return new Date(iso).toLocaleDateString("de-AT", { day: "numeric", month: "short" });
}

function text(n: Item) {
  const t = n.tasks ? `„${n.tasks.title}“` : "eine gelöschte Aufgabe";
  switch (n.kind) {
    case "assigned":
      return `${n.actor} hat dir ${t} zugeteilt`;
    case "mention":
      return `${n.actor} hat dich bei ${t} erwähnt`;
    case "comment":
      return `${n.actor} hat ${t} kommentiert`;
    case "done":
      return `${n.actor} hat ${t} erledigt`;
  }
}

export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("notifications").select("*, tasks(title, project_id)").order("created_at", { ascending: false }).limit(30);
    const rows = (data ?? []) as (Notification & { tasks: { title: string; project_id: string } | null })[];
    const ids = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))];
    const { data: people } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
    const name = new Map((people ?? []).map((p) => [p.id, p.display_name || "Jemand"]));
    setItems(rows.map((r) => ({ ...r, actor: (r.actor_id && name.get(r.actor_id)) || "Jemand" })));
  }, [supabase, userId]);

  useEffect(() => {
    load();
    if (!userId) return;
    const ch = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, load]);

  // Schließen bei Klick daneben oder Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  async function markRead(ids: number[]) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids).is("read_at", null);
  }

  async function go(n: Item) {
    await markRead([n.id]);
    setOpen(false);
    if (n.tasks) router.push(`/p/${n.tasks.project_id}?aufgabe=${n.task_id}`);
  }

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="pr-notifications"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-bold text-(--c-ink) hover:bg-(--c-bg) ${open ? "bg-(--c-bg)" : ""}`}
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
          <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        <span className="flex-1 text-left">Mitteilungen</span>
        {unread > 0 && (
          <span className="min-w-6 h-6 px-1.5 rounded-full bg-(--c-accent) text-white text-xs font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
            <span className="sr-only"> ungelesen</span>
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panel}
          id="pr-notifications"
          role="region"
          aria-label="Mitteilungen"
          className="mt-1 rounded-xl border border-(--c-line) bg-(--c-surface) shadow-lg overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-(--c-line-soft)">
            <span className="text-xs font-extrabold uppercase tracking-wider text-(--c-muted)">Mitteilungen</span>
            {unread > 0 && (
              <button type="button" onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))} className="min-h-8 text-xs font-semibold text-(--c-accent) hover:underline">
                Alle gelesen
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-5 text-sm text-(--c-text-2)">Noch keine Mitteilungen. Hier erscheint, wenn dir jemand eine Aufgabe zuteilt, dich erwähnt oder etwas erledigt.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto overscroll-contain divide-y divide-(--c-line-soft)">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => go(n)} className={`w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-(--c-hover) ${n.read_at ? "" : "bg-(--c-accent-soft)"}`}>
                    <span aria-hidden className={`mt-1.5 size-2 rounded-full shrink-0 ${n.read_at ? "bg-transparent" : "bg-(--c-accent)"}`} />
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className={`text-sm leading-snug ${n.read_at ? "text-(--c-text-2)" : "font-semibold text-(--c-ink)"}`}>{text(n)}</span>
                      {n.body && (n.kind === "mention" || n.kind === "comment") && (
                        <span className="text-xs text-(--c-text-2) line-clamp-2">„{n.body}“</span>
                      )}
                      <span className="text-[11px] text-(--c-muted)">
                        {ago(n.created_at)}
                        {!n.read_at && <span className="sr-only">, ungelesen</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
