// Fehler auf dem Server (Seiten, API, Server-Aktionen) an Projektraum melden.
export async function onRequestError(err: unknown, request: { path: string; method: string }) {
  try {
    const e = err as Error & { digest?: string };
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/rpc/report_error`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        src: "server",
        msg: String(e?.message ?? err).slice(0, 1000),
        detail: `${request.method} ${request.path}\n${e?.digest ? `Digest: ${e.digest}\n` : ""}${String(e?.stack ?? "").slice(0, 3500)}`,
        page: request.path,
        agent: "server",
      }),
    });
  } catch {
    // Melden darf nie selbst einen Fehler auslösen
  }
}
