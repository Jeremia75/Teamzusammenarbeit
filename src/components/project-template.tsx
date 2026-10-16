"use client";

// Vorlagen: ein Projekt als Vorlage speichern – und aus einer Vorlage ein neues Projekt anlegen.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Template = { id: string; name: string; description: string; task_count: number; span_days: number | null; workspace_id: string };

/** Unten auf der Projektseite: "Als Vorlage speichern" */
export function SaveAsTemplate({ projectId, projectName }: { projectId: string; projectName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("save_project_template", { proj: projectId, tpl_name: name, tpl_description: description });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Nicht gespeichert: " + error.message });
    setMsg({ ok: true, text: `Vorlage „${name.trim()}“ gespeichert. Du findest sie links unter „Vorlagen“ und beim Anlegen eines neuen Projekts.` });
  }

  return (
    <details data-panel className="max-w-2xl rounded-xl border border-(--c-line) bg-(--c-surface) px-4 py-3">
      <summary className="min-h-9 flex items-center cursor-pointer text-sm font-semibold">Als Vorlage speichern</summary>
      <form onSubmit={save} className="flex flex-col gap-3 pt-3">
        <p className="text-sm text-(--c-text-2)">
          Rubriken, Meilensteine und alle Aufgaben samt Unteraufgaben und „Wartet auf“ werden übernommen – ohne Verantwortliche, Kommentare und Dateien.
          Termine werden später passend zum neuen Startdatum verschoben.
        </p>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Name der Vorlage
          <input value={name} onChange={(e) => setName(e.target.value)} required className="h-11 rounded-lg border border-(--c-line) px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Beschreibung <span className="font-normal text-(--c-muted) -mt-1">optional</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="h-11 rounded-lg border border-(--c-line) px-3 font-normal" />
        </label>
        <button type="submit" disabled={busy || !name.trim()} className="self-start h-11 px-5 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60">
          {busy ? "Wird gespeichert …" : "Vorlage speichern"}
        </button>
        {msg && (
          <p role="status" className={`text-sm ${msg.ok ? "text-(--c-success-ink)" : "text-(--c-danger)"}`}>
            {msg.text}{" "}
            {msg.ok && (
              <a href="/vorlagen" className="font-semibold underline underline-offset-2">
                Zu den Vorlagen
              </a>
            )}
          </p>
        )}
      </form>
    </details>
  );
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Auswahl einer Vorlage beim Anlegen eines Projekts (lädt die Vorlagen erst, wenn sie gebraucht werden) */
export function useTemplates(enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Template[] | null>(null);
  useEffect(() => {
    if (!enabled || list) return;
    supabase
      .from("project_templates")
      .select("id, name, description, task_count, span_days, workspace_id")
      .order("name")
      .then(({ data }) => setList(data ?? []));
  }, [enabled, list, supabase]);
  return [list, setList] as const;
}

export function TemplateFields({
  templates,
  value,
  onChange,
  start,
  onStart,
  onRemoved,
}: {
  templates: Template[];
  value: string;
  onChange: (id: string) => void;
  start: string;
  onStart: (d: string) => void;
  onRemoved: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const t = templates.find((x) => x.id === value);
  if (!templates.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
        Vorlage
        <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-lg border border-(--c-line) bg-(--c-surface) px-2 text-sm text-(--c-ink)">
          <option value="">Leeres Projekt</option>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {t && (
        <>
          <label className="flex flex-col gap-1 text-xs font-semibold text-(--c-muted)">
            Startdatum
            <input type="date" value={start} onChange={(e) => onStart(e.target.value || todayIso())} className="h-10 rounded-lg border border-(--c-line) px-2 text-sm text-(--c-ink)" />
          </label>
          <p className="text-xs text-(--c-text-2)">
            {t.task_count === 1 ? "1 Aufgabe" : `${t.task_count} Aufgaben`}
            {t.span_days ? ` · Termine über ${t.span_days} Tage ab dem Startdatum` : ""}
            {t.description ? ` · ${t.description}` : ""}
          </p>
          <button
            type="button"
            onClick={async () => {
              const { error } = await supabase.rpc("update_project_template", { tpl: t.id, tpl_name: t.name, tpl_description: t.description, remove: true });
              if (!error) onRemoved(t.id);
            }}
            className="self-start text-xs font-semibold text-(--c-danger) min-h-8"
          >
            Diese Vorlage entfernen
          </button>
        </>
      )}
    </div>
  );
}

export { todayIso };

/** Projekt aus Vorlage anlegen und hinspringen */
export function useCreateFromTemplate() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  return async (tpl: string, ws: string, name: string, start: string, section: string | null) => {
    const { data, error } = await supabase.rpc("create_project_from_template", { tpl, ws, proj_name: name, start_on: start, section });
    if (error || !data) return error?.message ?? "Projekt konnte nicht angelegt werden.";
    router.push(`/p/${data}`);
    router.refresh();
    return null;
  };
}
