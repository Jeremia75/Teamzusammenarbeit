"use client";

import { useState } from "react";
import { createProject } from "@/app/(app)/actions";

export function NewProjectTile({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
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
    <form action={createProject} className="h-full min-h-28 rounded-xl border-2 border-dashed border-[#9AA4AE] bg-white p-3 flex flex-col gap-2">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label className="sr-only" htmlFor={`tile-${workspaceId}`}>Projektname</label>
      <input
        id={`tile-${workspaceId}`}
        name="name"
        required
        autoFocus
        placeholder="Projektname"
        className="h-10 rounded-lg border border-[#DDE1E5] px-3 text-sm"
      />
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
