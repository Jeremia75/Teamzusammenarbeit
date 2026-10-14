"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Grant = { client: { id: string; name: string; uri: string }; scopes: string[]; granted_at: string };

/** Liste der verbundenen KI-Apps mit der Möglichkeit, den Zugriff zu entziehen */
export function KiConnections() {
  const supabase = useMemo(() => createClient(), []);
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error) {
      setUnavailable(true);
      setGrants([]);
    } else setGrants((data ?? []) as Grant[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(id: string) {
    setError(null);
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId: id });
    if (error) return setError("Konnte den Zugriff nicht entziehen: " + error.message);
    setConfirm(null);
    load();
  }

  return (
    <section aria-labelledby="ki-con" className="bg-(--c-surface) border border-(--c-line) rounded-xl p-5 sm:p-6 flex flex-col gap-3">
      <h2 id="ki-con" className="text-lg font-extrabold">Verbundene Apps</h2>
      {grants === null ? (
        <p className="text-sm text-(--c-muted)">Einen Moment …</p>
      ) : unavailable ? (
        <p className="text-sm text-(--c-text-2)">Die Verbindung mit KI-Apps ist noch nicht freigeschaltet.</p>
      ) : grants.length === 0 ? (
        <p className="text-sm text-(--c-text-2)">Noch keine App verbunden.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {grants.map((g) => (
            <li key={g.client.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-(--c-line-soft) px-3 py-2.5">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{g.client.name || "Unbenannte App"}</span>
                <span className="block text-xs text-(--c-muted)">
                  Erlaubt am {new Date(g.granted_at).toLocaleDateString("de-AT", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              </span>
              {confirm === g.client.id ? (
                <>
                  <button type="button" onClick={() => revoke(g.client.id)} className="min-h-10 px-3 rounded-lg bg-(--c-danger) text-(--c-on-danger) text-sm font-bold">
                    Zugriff entziehen
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="min-h-10 px-3 rounded-lg border border-(--c-line) text-sm font-bold">
                    Abbrechen
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm(g.client.id)}
                  aria-label={`${g.client.name || "App"} trennen`}
                  className="min-h-10 px-3 rounded-lg border border-(--c-line) text-sm font-semibold hover:bg-(--c-hover)"
                >
                  Trennen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-(--c-danger)">{error}</p>}
    </section>
  );
}
