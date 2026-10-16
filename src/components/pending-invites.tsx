"use client";

// Offene Einladungen eines Bereichs oder Projekts (nur für Admins sichtbar, siehe RLS):
// erneut schicken oder zurückziehen.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { roleLabel } from "@/lib/labels";
import type { WorkspaceRole } from "@/lib/database.types";

type Invite = { id: string; email: string; role: WorkspaceRole; created_at: string; mailed_at: string | null; mail_error: string | null };

/** Ereignis, nach dem die Liste neu geladen wird (nach einer neuen Einladung) */
export const INVITES_CHANGED = "projektraum:invites-changed";

export function PendingInvites({ workspaceId, projectId }: { workspaceId?: string; projectId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Invite[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase
      .from("invitations")
      .select("id, email, role, created_at, mailed_at, mail_error")
      .is("accepted_at", null)
      .is("withdrawn_at", null)
      .order("created_at", { ascending: false });
    q = workspaceId ? q.eq("workspace_id", workspaceId) : q.eq("project_id", projectId ?? "");
    const { data } = await q;
    setList((data ?? []) as Invite[]);
  }, [supabase, workspaceId, projectId]);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener(INVITES_CHANGED, on);
    // Status „verschickt“ nach ein paar Sekunden nachladen
    const t = setTimeout(load, 8000);
    return () => {
      window.removeEventListener(INVITES_CHANGED, on);
      clearTimeout(t);
    };
  }, [load]);

  async function withdraw(i: Invite) {
    const { error } = await supabase.rpc("withdraw_invitation", { inv: i.id });
    if (error) return setMsg("Nicht zurückgezogen: " + error.message);
    setMsg(`Einladung an ${i.email} zurückgezogen.`);
    load();
  }
  async function resend(i: Invite) {
    const { error } = await supabase.rpc("resend_invitation", { inv: i.id });
    if (error) return setMsg("Nicht verschickt: " + error.message);
    setMsg(`Einladung an ${i.email} wird erneut verschickt.`);
    load();
    setTimeout(load, 8000);
  }

  if (!list.length && !msg) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {list.length > 0 && (
        <>
          <span className="text-sm font-semibold">Eingeladen, noch nicht registriert</span>
          <ul aria-label="Offene Einladungen" className="flex flex-col divide-y divide-(--c-line-soft)">
            {list.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
                <span aria-hidden className="size-[26px] rounded-full border-2 border-dashed border-(--c-line-hover) flex items-center justify-center text-(--c-muted) text-xs">
                  @
                </span>
                <span className="font-semibold break-all">{i.email}</span>
                <span className="text-(--c-muted)">
                  {roleLabel(i.role)} ·{" "}
                  {i.mail_error ? (
                    <span className="text-(--c-danger)" title={i.mail_error}>
                      Mail nicht zugestellt
                    </span>
                  ) : i.mailed_at ? (
                    `verschickt ${new Date(i.mailed_at).toLocaleDateString("de-AT", { day: "numeric", month: "short" })}`
                  ) : (
                    "wird verschickt …"
                  )}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => resend(i)} className="min-h-9 px-2.5 rounded-lg text-sm font-semibold hover:bg-(--c-hover)">
                    Erneut schicken
                  </button>
                  <button
                    type="button"
                    onClick={() => withdraw(i)}
                    aria-label={`Einladung an ${i.email} zurückziehen`}
                    className="min-h-9 px-2.5 rounded-lg text-sm font-semibold text-(--c-danger) hover:bg-(--c-hover)"
                  >
                    Zurückziehen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {msg && (
        <p role="status" className="text-sm text-(--c-text-2)">
          {msg}
        </p>
      )}
    </div>
  );
}
