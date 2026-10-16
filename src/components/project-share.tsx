"use client";

// Ein einzelnes Projekt für Externe freigeben (z. B. Steuerberatung), ohne den ganzen Bereich.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROLES } from "@/lib/labels";
import type { WorkspaceRole } from "@/lib/database.types";
import { Avatar } from "@/components/avatar";
import { INVITES_CHANGED, PendingInvites } from "@/components/pending-invites";

export type Guest = { id: string; name: string; color: string; role: WorkspaceRole; alsoMember?: boolean };

export function ProjectShare({ projectId, projectName, guests }: { projectId: string; projectName: string; guests: Guest[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [roles, setRoles] = useState<Record<string, WorkspaceRole>>({});
  const [removed, setRemoved] = useState<string[]>([]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("add_project_guest", { proj: projectId, guest_email: mail, guest_role: role });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    if (data === "invited") {
      setEmail("");
      window.dispatchEvent(new Event(INVITES_CHANGED));
      return setMsg({
        ok: true,
        text: `${mail} hat noch kein Konto. Wir haben eine Einladung per E-Mail geschickt. Nach der Registrierung sieht die Person „${projectName}“.`,
      });
    }
    setEmail("");
    setMsg({ ok: true, text: `${mail} sieht jetzt „${projectName}“ (${ROLES.find((r) => r.id === role)?.label}).` });
    router.refresh();
  }

  async function change(g: Guest, r: WorkspaceRole) {
    setRoles((x) => ({ ...x, [g.id]: r }));
    const { error } = await supabase.rpc("set_project_guest_role", { proj: projectId, guest: g.id, guest_role: r });
    if (error) {
      setRoles((x) => ({ ...x, [g.id]: g.role }));
      return setMsg({ ok: false, text: "Rolle nicht gespeichert: " + error.message });
    }
    setMsg({ ok: true, text: `${g.name}: ${ROLES.find((x) => x.id === r)?.label}` });
    router.refresh();
  }

  async function remove(g: Guest) {
    const { error } = await supabase.rpc("remove_project_guest", { proj: projectId, guest: g.id });
    if (error) return setMsg({ ok: false, text: "Nicht entfernt: " + error.message });
    setRemoved((x) => [...x, g.id]);
    setMsg({ ok: true, text: `${g.name} sieht „${projectName}“ nicht mehr.` });
    router.refresh();
  }

  const list = guests.filter((g) => !removed.includes(g.id));

  return (
    <details data-panel className="max-w-2xl rounded-xl border border-(--c-line) bg-(--c-surface) px-4 py-3">
      <summary className="min-h-9 flex items-center gap-2 cursor-pointer text-sm font-semibold">
        Für Externe freigeben
        {list.length > 0 && <span className="rounded-full bg-(--c-hover) px-2 text-xs font-bold">{list.length}</span>}
      </summary>
      <div className="flex flex-col gap-4 pt-3">
        <p className="text-sm text-(--c-text-2)">
          Gäste sehen nur dieses Projekt – nicht die anderen Projekte im Bereich. Hat die Person noch kein Konto, bekommt sie eine Einladung per E-Mail.
        </p>
        {list.length > 0 && (
          <ul aria-label="Gäste in diesem Projekt" className="flex flex-col divide-y divide-(--c-line-soft)">
            {list.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Avatar member={g} size={26} />
                <span className="font-semibold">{g.name}</span>
                {g.alsoMember && <span className="text-xs text-(--c-muted)">(auch im Bereich)</span>}
                <span className="ml-auto flex items-center gap-1">
                  <select
                    aria-label={`Rolle von ${g.name} in diesem Projekt`}
                    value={roles[g.id] ?? g.role}
                    onChange={(e) => change(g, e.target.value as WorkspaceRole)}
                    className="h-9 rounded-lg border border-(--c-line) bg-(--c-surface) px-2 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => remove(g)}
                    aria-label={`${g.name} aus dem Projekt entfernen`}
                    className="min-h-9 px-2.5 rounded-lg text-sm font-semibold text-(--c-danger) hover:bg-(--c-hover)"
                  >
                    Entfernen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <PendingInvites projectId={projectId} />
        <form onSubmit={add} className="flex flex-col gap-2">
          <label htmlFor="guest-email" className="text-sm font-semibold">
            Gast hinzufügen
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="guest-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-Mail-Adresse"
              className="min-w-0 flex-[1_1_200px] h-11 rounded-lg border border-(--c-line) px-3 text-sm"
            />
            <select aria-label="Rolle des Gastes" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)} className="h-11 rounded-lg border border-(--c-line) bg-(--c-surface) px-2 text-sm">
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy} className="h-11 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60">
              Freigeben
            </button>
          </div>
        </form>
        {msg && (
          <p role="status" className={`text-sm ${msg.ok ? "text-(--c-success-ink)" : "text-(--c-danger)"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </details>
  );
}
