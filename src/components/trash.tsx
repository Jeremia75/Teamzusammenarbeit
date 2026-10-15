"use client";

// Papierkorb: gelöschte Aufgaben und Projekte 30 Tage lang wiederherstellen oder endgültig löschen.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { DeleteConfirm, purgeTrashItem } from "@/components/attachments";

type Item = Database["public"]["Functions"]["trash_list"]["Returns"][number];

const DAYS = 30;
function daysLeft(iso: string) {
  const ms = new Date(iso).getTime() + DAYS * 86400000 - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export function Trash() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[] | null>(null);
  const [purging, setPurging] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; href?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("trash_list");
    if (error) setError("Papierkorb konnte nicht geladen werden: " + error.message);
    setItems(data ?? []);
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  async function restore(it: Item) {
    setBusy(it.id);
    setError(null);
    const { error } = await supabase.rpc("trash_restore", { k: it.kind, item: it.id });
    setBusy(null);
    if (error) return setError("Wiederherstellen hat nicht geklappt: " + error.message);
    setMsg({
      text: it.kind === "project" ? `Projekt „${it.title}“ ist wieder da.` : `„${it.title}“ ist wieder in ${it.project}.`,
      href: it.kind === "project" ? `/p/${it.id}` : `/p/${it.project_id}?aufgabe=${it.id}`,
    });
    load();
    router.refresh(); // Seitenleiste aktualisieren
  }

  async function purge(it: Item) {
    setBusy(it.id);
    setError(null);
    const { error } = await purgeTrashItem(supabase, it.kind, it.id);
    setBusy(null);
    setPurging(null);
    if (error) return setError("Endgültig löschen hat nicht geklappt: " + error.message);
    setMsg({ text: `„${it.title}“ ist endgültig gelöscht.` });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-7 py-8 flex flex-col gap-6">
      <header data-panel className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Papierkorb</h1>
        <p className="text-(--c-text-2)">
          Gelöschte Aufgaben und Projekte bleiben hier {DAYS} Tage. Bis dahin kannst du sie mit allen Unteraufgaben, Kommentaren und Dateien wiederherstellen.
          Danach werden sie automatisch endgültig gelöscht.
        </p>
      </header>

      {msg && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg bg-(--c-success-soft) text-(--c-success-ink) px-4 py-3 text-sm font-semibold">
          {msg.text}
          {msg.href && (
            <Link href={msg.href} className="underline underline-offset-4">
              Ansehen
            </Link>
          )}
          <button type="button" onClick={() => setMsg(null)} className="ml-auto underline min-h-9">
            Schließen
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-(--c-danger-soft) text-(--c-danger) px-4 py-3 text-sm font-semibold">
          {error}
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-(--c-muted)">Einen Moment …</p>
      ) : items.length === 0 ? (
        <section data-panel className="rounded-xl border border-(--c-line) bg-(--c-surface) p-6 text-center flex flex-col gap-1">
          <p className="text-lg font-bold">Der Papierkorb ist leer</p>
          <p className="text-sm text-(--c-text-2)">Wenn du eine Aufgabe oder ein Projekt löschst, landet es zuerst hier.</p>
        </section>
      ) : (
        <ul data-panel aria-label="Gelöschte Einträge" className="rounded-xl border border-(--c-line) bg-(--c-surface) divide-y divide-(--c-line-soft)">
          {items.map((it) => {
            const left = daysLeft(it.deleted_at);
            return (
              <li key={`${it.kind}-${it.id}`} className="px-4 py-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-(--c-muted)">{it.kind === "project" ? "Projekt" : "Aufgabe"}</span>
                      <span className="font-semibold truncate">{it.title}</span>
                    </span>
                    <span className="text-xs text-(--c-text-2)">
                      {it.kind === "project"
                        ? `${it.workspace} · ${it.task_count} ${it.task_count === 1 ? "Aufgabe" : "Aufgaben"}`
                        : `${it.project}${it.task_count ? ` · ${it.task_count} Unteraufgaben` : ""}`}
                      {it.file_count > 0 && ` · ${it.file_count} ${it.file_count === 1 ? "Datei" : "Dateien"}`}
                    </span>
                    <span className="text-xs text-(--c-muted)">
                      Gelöscht von {it.deleted_by} am {new Date(it.deleted_at).toLocaleDateString("de-AT", { day: "numeric", month: "long" })} · noch{" "}
                      {left === 1 ? "1 Tag" : `${left} Tage`}
                    </span>
                    {it.kind === "project" && !it.can_purge && (
                      <span className="text-xs text-(--c-muted)">Wiederherstellen kann, wer das Projekt angelegt hat, oder ein Admin.</span>
                    )}
                  </div>
                  {purging !== it.id && (it.kind === "task" || it.can_purge) && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy === it.id}
                        onClick={() => restore(it)}
                        aria-label={`${it.title} wiederherstellen`}
                        className="min-h-10 px-3.5 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60"
                      >
                        Wiederherstellen
                      </button>
                      {it.can_purge && (
                        <button
                          type="button"
                          onClick={() => setPurging(it.id)}
                          aria-label={`${it.title} endgültig löschen`}
                          className="min-h-10 px-3.5 rounded-lg border border-(--c-line) text-sm font-semibold text-(--c-danger) hover:bg-(--c-hover)"
                        >
                          Endgültig löschen
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {purging === it.id && (
                  <DeleteConfirm
                    trashItem={{ kind: it.kind, id: it.id }}
                    question={`„${it.title}“ endgültig löschen? Das lässt sich nicht rückgängig machen.`}
                    confirmLabel="Endgültig löschen"
                    onDelete={() => purge(it)}
                    onCancel={() => setPurging(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
