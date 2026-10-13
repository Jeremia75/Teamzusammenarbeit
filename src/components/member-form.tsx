"use client";

import { useActionState } from "react";
import { addMember, type MemberFormState } from "@/app/(app)/actions";

export function MemberForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(addMember, null);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label htmlFor={`member-${workspaceId}`} className="text-sm font-semibold">
        Mitglied hinzufügen
      </label>
      <div className="flex gap-2">
        <input
          id={`member-${workspaceId}`}
          name="email"
          type="email"
          required
          placeholder="E-Mail-Adresse"
          className="min-w-0 flex-1 h-11 rounded-lg border border-(--c-line) px-3 text-sm"
        />
        <button type="submit" disabled={pending} className="h-11 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60">
          Hinzufügen
        </button>
      </div>
      {state && (
        <p role="status" className={`text-sm ${state.ok ? "text-(--c-success-ink)" : "text-(--c-danger)"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
