"use client";

import { useState } from "react";
import { createProject } from "@/app/(app)/actions";
import { TemplateFields, todayIso, useCreateFromTemplate, useTemplates } from "@/components/project-template";

/** "Neues Projekt" – als große Kachel (Kachelansicht) oder schlank (in einer Board-Rubrik). */
export function NewProjectTile({
  workspaceId,
  sectionId = null,
  compact = false,
}: {
  workspaceId: string;
  sectionId?: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useTemplates(open);
  const [tpl, setTpl] = useState("");
  const [start, setStart] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromTemplate = useCreateFromTemplate();
  const fieldId = `np-${workspaceId}-${sectionId ?? "none"}-${compact ? "c" : "t"}`;

  if (!open) {
    return compact ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-11 rounded-lg px-3 text-left text-sm text-(--c-muted) hover:bg-(--c-surface)/70"
      >
        + Projekt hinzufügen
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-panel="soft"
        className="w-full h-full min-h-28 rounded-xl border-2 border-dashed border-(--c-line-strong) text-(--c-text-2) font-semibold flex items-center justify-center gap-2 hover:border-(--c-line-hover) hover:bg-(--c-surface)"
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Neues Projekt
      </button>
    );
  }

  return (
    <form
      action={createProject}
      onSubmit={async (e) => {
        if (!tpl) return; // leeres Projekt: wie bisher
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
        if (!name) return;
        setBusy(true);
        setError(null);
        const err = await fromTemplate(tpl, workspaceId, name, start, sectionId);
        if (err) {
          setBusy(false);
          setError(err);
        }
      }}
      className={`rounded-xl bg-(--c-surface) p-3 flex flex-col gap-2 ${compact ? "border border-(--c-line)" : "h-full min-h-28 border-2 border-dashed border-(--c-line-hover)"}`}
    >
      <input type="hidden" name="workspace_id" value={workspaceId} />
      {sectionId && <input type="hidden" name="section_id" value={sectionId} />}
      <label className="sr-only" htmlFor={fieldId}>Projektname</label>
      <input id={fieldId} name="name" required autoFocus placeholder="Projektname" className="h-10 rounded-lg border border-(--c-line) px-3 text-sm" />
      {templates && templates.length > 0 && (
        <TemplateFields
          templates={templates}
          value={tpl}
          onChange={setTpl}
          start={start}
          onStart={setStart}
          onRemoved={(id) => {
            setTemplates(templates.filter((t) => t.id !== id));
            setTpl("");
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-(--c-danger)">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="h-10 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60">
          {busy ? "Wird angelegt …" : "Anlegen"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 px-3 text-sm font-semibold text-(--c-text-2)">
          Abbrechen
        </button>
      </div>
    </form>
  );
}
