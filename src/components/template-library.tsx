"use client";

// Seite „Vorlagen“: alle gespeicherten Projektvorlagen, daraus ein Projekt anlegen oder eine Vorlage entfernen.

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { todayIso, useCreateFromTemplate } from "@/components/project-template";

export type LibTemplate = {
  id: string;
  name: string;
  description: string;
  task_count: number;
  span_days: number | null;
  workspace_id: string;
  workspaceName: string;
  created_at: string;
};
type Ws = { id: string; name: string; orgName: string; isPersonal: boolean };

export function TemplateLibrary({ templates, workspaces }: { templates: LibTemplate[]; workspaces: Ws[] }) {
  const [list, setList] = useState(templates);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="px-4 sm:px-7 py-6 flex flex-col gap-6 max-w-4xl">
      <header data-panel className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Vorlagen</h1>
        <p className="text-(--c-text-2) max-w-2xl">
          Aus einer Vorlage entsteht mit einem Klick ein neues Projekt – mit allen Rubriken, Meilensteinen und Aufgaben. Die Termine werden passend zum
          Startdatum verschoben.
        </p>
      </header>

      {list.length === 0 ? (
        <section data-panel className="rounded-xl border border-(--c-line) bg-(--c-surface) p-5 flex flex-col gap-2 max-w-2xl">
          <h2 className="font-bold">Noch keine Vorlagen</h2>
          <p className="text-sm text-(--c-text-2)">
            So legst du eine an: Öffne ein Projekt, das du öfter brauchst, scrolle ganz nach unten und klappe <strong>Als Vorlage speichern</strong> auf.
            Danach steht sie hier.
          </p>
        </section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 items-start">
          {list.map((t) => (
            <li key={t.id} data-panel className="rounded-xl border border-(--c-line) bg-(--c-surface) p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="font-bold text-lg leading-snug">{t.name}</h2>
                {t.description && <p className="text-sm text-(--c-text-2)">{t.description}</p>}
                <p className="text-xs text-(--c-muted)">
                  {t.task_count === 1 ? "1 Aufgabe" : `${t.task_count} Aufgaben`}
                  {t.span_days ? ` · Termine über ${t.span_days} Tage` : ""}
                  {t.workspaceName ? ` · aus ${t.workspaceName}` : ""}
                </p>
              </div>
              {openId === t.id ? (
                <CreateForm t={t} workspaces={workspaces} onCancel={() => setOpenId(null)} />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!workspaces.length}
                    onClick={() => setOpenId(t.id)}
                    className="h-10 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-50"
                  >
                    Projekt daraus anlegen
                  </button>
                  <RemoveButton t={t} onRemoved={() => setList((l) => l.filter((x) => x.id !== t.id))} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-(--c-muted)">
        Tipp: Beim Anlegen eines Projekts in der Übersicht kannst du ebenfalls eine Vorlage wählen. Mehr in der{" "}
        <Link href="/hilfe#vorlagen" className="underline underline-offset-2">
          Hilfe
        </Link>
        .
      </p>
    </div>
  );
}

function CreateForm({ t, workspaces, onCancel }: { t: LibTemplate; workspaces: Ws[]; onCancel: () => void }) {
  const create = useCreateFromTemplate();
  const [name, setName] = useState(t.name);
  const [ws, setWs] = useState(workspaces.some((w) => w.id === t.workspace_id) ? t.workspace_id : (workspaces[0]?.id ?? ""));
  const [start, setStart] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const err = await create(t.id, ws, name.trim(), start, null);
        if (err) {
          setBusy(false);
          setError(err);
        }
      }}
      className="flex flex-col gap-2 border-t border-(--c-line-soft) pt-3"
    >
      <label className="flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
        Name des neuen Projekts
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="h-10 rounded-lg border border-(--c-line) px-3 text-sm text-(--c-ink)" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
          Bereich
          <select value={ws} onChange={(e) => setWs(e.target.value)} className="h-10 rounded-lg border border-(--c-line) bg-(--c-surface) px-2 text-sm text-(--c-ink)">
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.isPersonal ? w.name : `${w.orgName} · ${w.name}`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
          Startdatum
          <input type="date" value={start} onChange={(e) => setStart(e.target.value || todayIso())} className="h-10 rounded-lg border border-(--c-line) px-2 text-sm text-(--c-ink)" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs font-semibold text-(--c-danger)">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !name.trim() || !ws} className="h-10 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60">
          {busy ? "Wird angelegt …" : "Anlegen und öffnen"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 px-3 text-sm font-semibold text-(--c-text-2)">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function RemoveButton({ t, onRemoved }: { t: LibTemplate; onRemoved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ask)
    return (
      <button type="button" onClick={() => setAsk(true)} className="h-10 px-3 rounded-lg text-sm font-semibold text-(--c-danger) hover:bg-(--c-hover)">
        Entfernen
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      Wirklich entfernen?
      <button
        type="button"
        onClick={async () => {
          const { error } = await supabase.rpc("update_project_template", { tpl: t.id, tpl_name: t.name, tpl_description: t.description, remove: true });
          if (error) return setError(error.message);
          onRemoved();
        }}
        className="h-9 px-3 rounded-lg bg-(--c-danger) text-(--c-on-danger) font-bold"
      >
        Ja
      </button>
      <button type="button" onClick={() => setAsk(false)} className="h-9 px-2 font-semibold text-(--c-text-2)">
        Nein
      </button>
      {error && <span className="text-(--c-danger)">{error}</span>}
    </span>
  );
}
