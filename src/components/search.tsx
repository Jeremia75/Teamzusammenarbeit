"use client";

// Suche über Projekte, Aufgaben, Kommentare und Dateinamen. Öffnet sich mit Strg+K (bzw. ⌘K) oder über die Seitenleiste.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OPEN_SEARCH_EVENT } from "@/components/shortcuts";
import { createClient } from "@/lib/supabase/client";
import { statusOf } from "@/lib/labels";
import type { TaskStatus } from "@/lib/database.types";

type Hit = { key: string; group: string; title: string; sub: string; href: string; color?: string; status?: TaskStatus; snippet?: string };

const GROUPS = ["Projekte", "Aufgaben", "Kommentare", "Dateien und Links"];

/** Suchtext für die Datenbank: Sonderzeichen entschärfen */
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c).replace(/[,()]/g, " ")}%`;

function Mark({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-(--c-accent-soft-2) text-inherit rounded-sm px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Ausschnitt rund um den Treffer */
function around(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 120);
  const start = Math.max(0, i - 40);
  return (start > 0 ? "…" : "") + text.slice(start, i + q.length + 70) + (i + q.length + 70 < text.length ? "…" : "");
}

export function SearchButton() {
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const openIt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, openIt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, openIt);
    };
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-semibold text-(--c-text-2) border border-(--c-line) bg-(--c-bg) hover:text-(--c-ink)"
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
        <span className="flex-1 text-left">Suchen</span>
        <kbd className="hidden md:inline text-[11px] font-semibold text-(--c-muted) border border-(--c-line) rounded px-1.5 py-0.5 bg-(--c-surface)">{mac ? "⌘K" : "Strg K"}</kbd>
      </button>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    let off = false;
    setBusy(true);
    const t = setTimeout(async () => {
      const pat = pattern(term);
      const [p, tk, c, f] = await Promise.all([
        supabase.from("projects").select("id, name, color, workspaces(name)").ilike("name", pat).is("archived_at", null).limit(6),
        supabase
          .from("tasks")
          .select("id, title, description, status, project_id, parent_id, projects!inner(name, color, archived_at)")
          .or(`title.ilike.${pat},description.ilike.${pat}`)
          .is("projects.archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(15),
        supabase.from("comments").select("id, body, task_id, tasks!inner(title, project_id)").ilike("body", pat).order("created_at", { ascending: false }).limit(6),
        supabase.from("task_attachments").select("id, name, task_id, tasks!inner(title, project_id)").ilike("name", pat).limit(6),
      ]);
      if (off) return;
      const out: Hit[] = [
        ...(p.data ?? []).map((x) => ({ key: `p${x.id}`, group: "Projekte", title: x.name, sub: x.workspaces?.name ?? "", href: `/p/${x.id}`, color: x.color })),
        ...(tk.data ?? []).map((x) => ({
          key: `t${x.id}`,
          group: "Aufgaben",
          title: x.title,
          sub: x.projects.name + (x.parent_id ? " · Unteraufgabe" : ""),
          href: `/p/${x.project_id}?aufgabe=${x.parent_id ?? x.id}`,
          color: x.projects.color,
          status: x.status,
          snippet: !x.title.toLowerCase().includes(term.toLowerCase()) && x.description ? around(x.description, term) : undefined,
        })),
        ...(c.data ?? []).map((x) => ({
          key: `c${x.id}`,
          group: "Kommentare",
          title: x.tasks.title,
          sub: "Kommentar",
          href: `/p/${x.tasks.project_id}?aufgabe=${x.task_id}`,
          snippet: around(x.body, term),
        })),
        ...(f.data ?? []).map((x) => ({ key: `f${x.id}`, group: "Dateien und Links", title: x.name, sub: `bei „${x.tasks.title}“`, href: `/p/${x.tasks.project_id}?aufgabe=${x.task_id}` })),
      ];
      setHits(out);
      setActive(0);
      setBusy(false);
    }, 200);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [q, supabase]);

  function go(h: Hit) {
    onClose();
    router.push(h.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!hits?.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[active]);
    }
  }

  // Aktiven Treffer sichtbar halten
  useEffect(() => {
    ref.current?.querySelector(`[data-hit="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const term = q.trim();
  return (
    <dialog
      ref={ref}
      aria-label="Suchen"
      data-lock
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-0 sm:mx-auto sm:mt-[10vh] w-full sm:w-[min(640px,calc(100%-32px))] h-full sm:h-auto max-w-none max-h-none sm:max-h-[75vh] p-0 bg-(--c-surface) text-(--c-ink) sm:rounded-2xl sm:border sm:border-(--c-line) shadow-2xl backdrop:bg-black/45 flex-col open:flex"
    >
      <div className="flex items-center gap-2 border-b border-(--c-line) px-4">
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-(--c-muted) shrink-0">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Projekte, Aufgaben, Kommentare, Dateien …"
          aria-label="Suchbegriff"
          role="combobox"
          aria-expanded={!!hits?.length}
          aria-controls="search-results"
          aria-activedescendant={hits?.length ? `hit-${active}` : undefined}
          className="flex-1 min-w-0 h-14 bg-transparent text-base outline-none"
        />
        <button type="button" onClick={onClose} className="min-h-9 px-2.5 rounded-lg text-sm font-semibold text-(--c-muted) hover:bg-(--c-hover)">
          Esc
        </button>
      </div>

      <div className="overflow-y-auto overscroll-contain flex-1">
        {term.length < 2 ? (
          <p className="px-4 py-6 text-sm text-(--c-muted)">Tipp mindestens zwei Buchstaben. Mit den Pfeiltasten wählst du aus, mit Enter öffnest du.</p>
        ) : hits === null || (busy && !hits.length) ? (
          <p className="px-4 py-6 text-sm text-(--c-muted)">Suche …</p>
        ) : hits.length === 0 ? (
          <p className="px-4 py-6 text-sm text-(--c-text-2)">Nichts gefunden für „{term}“.</p>
        ) : (
          <ul id="search-results" role="listbox" aria-label="Treffer" className="py-2">
            {GROUPS.filter((g) => hits.some((h) => h.group === g)).map((g) => (
              <li key={g} role="presentation">
                <div className="px-4 pt-2 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-(--c-muted)">{g}</div>
                <ul role="presentation">
                  {hits.map((h, i) =>
                    h.group !== g ? null : (
                      <li
                        key={h.key}
                        id={`hit-${i}`}
                        data-hit={i}
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(h)}
                        className={`mx-2 px-3 py-2 rounded-lg cursor-pointer flex items-start gap-2.5 ${i === active ? "bg-(--c-hover)" : ""}`}
                      >
                        <span
                          aria-hidden
                          className="mt-1.5 size-2.5 rounded-sm shrink-0"
                          style={{ background: h.status ? statusOf(h.status).color : (h.color ?? "var(--c-muted)") }}
                        />
                        <span className="flex-1 min-w-0 flex flex-col">
                          <span className={`text-sm font-semibold truncate ${h.status === "done" ? "line-through text-(--c-muted)" : ""}`}>
                            <Mark text={h.title} q={term} />
                          </span>
                          {h.snippet && (
                            <span className="text-xs text-(--c-text-2) line-clamp-2">
                              <Mark text={h.snippet} q={term} />
                            </span>
                          )}
                          <span className="text-xs text-(--c-muted) truncate">{h.sub}</span>
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
