"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addMember, type MemberFormState } from "@/app/(app)/actions";
import { createClient } from "@/lib/supabase/client";
import { ROLES } from "@/lib/labels";
import type { WorkspaceRole } from "@/lib/database.types";
import { Avatar } from "@/components/avatar";

export type ManagedMember = { id: string; name: string; color: string; role: WorkspaceRole; isAdmin: boolean };

/** Mitglieder eines Bereichs mit ihrer Rolle – nur für Admins sichtbar */
export function MemberManager({ workspaceId, members, currentUserId }: { workspaceId: string; members: ManagedMember[]; currentUserId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [roles, setRoles] = useState<Record<string, WorkspaceRole>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function change(m: ManagedMember, role: WorkspaceRole) {
    setRoles((r) => ({ ...r, [m.id]: role }));
    const { error } = await supabase.rpc("set_member_role", { ws: workspaceId, member: m.id, member_role: role });
    if (error) {
      setRoles((r) => ({ ...r, [m.id]: m.role }));
      setMsg({ ok: false, text: "Rolle nicht gespeichert: " + error.message });
    } else {
      setMsg({ ok: true, text: `${m.name}: ${ROLES.find((x) => x.id === role)?.label}` });
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-(--c-line-soft)" aria-label="Mitglieder und Rollen">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <Avatar member={m} size={26} />
            <span className="font-semibold">{m.name}</span>
            {m.id === currentUserId && <span className="text-(--c-muted)">(ich)</span>}
            <span className="ml-auto">
              {m.isAdmin ? (
                <span className="inline-flex min-h-9 items-center px-2 text-(--c-muted)" title="Admins der Firma dürfen immer alles bearbeiten">
                  Admin · darf alles
                </span>
              ) : (
                <select
                  aria-label={`Rolle von ${m.name}`}
                  value={roles[m.id] ?? m.role}
                  onChange={(e) => change(m, e.target.value as WorkspaceRole)}
                  className="h-9 rounded-lg border border-(--c-line) bg-(--c-surface) px-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </li>
        ))}
      </ul>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-(--c-success-ink)" : "text-(--c-danger)"}`}>
          {msg.text}
        </p>
      )}
      <MemberForm workspaceId={workspaceId} />
      <p className="text-xs text-(--c-muted) leading-relaxed">
        {ROLES.map((r) => (
          <span key={r.id} className="block">
            <b className="text-(--c-text-2)">{r.label}</b> – {r.hint}
          </span>
        ))}
      </p>
    </div>
  );
}

export function MemberForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(addMember, null);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label htmlFor={`member-${workspaceId}`} className="text-sm font-semibold">
        Mitglied hinzufügen
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`member-${workspaceId}`}
          name="email"
          type="email"
          required
          placeholder="E-Mail-Adresse"
          className="min-w-0 flex-[1_1_200px] h-11 rounded-lg border border-(--c-line) px-3 text-sm"
        />
        <select name="role" aria-label="Rolle" defaultValue="editor" className="h-11 rounded-lg border border-(--c-line) bg-(--c-surface) px-2 text-sm">
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
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
