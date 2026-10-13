"use client";

import { useState } from "react";
import { createProject } from "@/app/(app)/actions";

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
  const fieldId = `np-${workspaceId}-${sectionId ?? "none"}-${compact ? "c" : "t"}`;

  if (!open) {
    return compact ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-11 rounded-lg px-3 text-left text-sm text-[#5A626B] hover:bg-white/70"
      >
        + Projekt hinzufügen
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-full min-h-28 rounded-xl border-2 border-dashed border-[#C9D0D6] text-[#3E4650] font-semibold flex items-center justify-center gap-2 hover:border-[#9AA4AE] hover:bg-white"
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
      className={`rounded-xl bg-white p-3 flex flex-col gap-2 ${compact ? "border border-[#DDE1E5]" : "h-full min-h-28 border-2 border-dashed border-[#9AA4AE]"}`}
    >
      <input type="hidden" name="workspace_id" value={workspaceId} />
      {sectionId && <input type="hidden" name="section_id" value={sectionId} />}
      <label className="sr-only" htmlFor={fieldId}>Projektname</label>
      <input id={fieldId} name="name" required autoFocus placeholder="Projektname" className="h-10 rounded-lg border border-[#DDE1E5] px-3 text-sm" />
      <div className="flex gap-2">
        <button type="submit" className="h-10 px-4 rounded-lg bg-[#16191D] text-white text-sm font-bold">
          Anlegen
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 px-3 text-sm font-semibold text-[#3E4650]">
          Abbrechen
        </button>
      </div>
    </form>
  );
}
