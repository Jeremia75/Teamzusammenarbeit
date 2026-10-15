// Fehlermeldungen per E-Mail und tägliche Datensicherung – ohne Abhängigkeiten, damit es sich leicht testen lässt.

export type AppError = { id: number; source: string; message: string; detail: string; url: string; user_agent: string; count: number; created_at: string; last_seen: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const WHERE: Record<string, string> = { browser: "im Browser", server: "auf dem Server", function: "im Hintergrund-Dienst" };

export function errorMail(errors: AppError[], appUrl: string) {
  const n = errors.length;
  const subject = n === 1 ? `Projektraum: ein Fehler – ${errors[0].message.slice(0, 60)}` : `Projektraum: ${n} neue Fehler`;
  const items = errors
    .map(
      (e) => `<li style="margin:0 0 14px">
<div style="font-weight:700">${esc(e.message.slice(0, 300))}</div>
<div style="color:#5A626B;font-size:13px">${esc(WHERE[e.source] ?? e.source)}${e.url ? ` · ${esc(e.url)}` : ""} · ${e.count === 1 ? "einmal" : `${e.count}-mal`}</div>
${e.detail ? `<pre style="white-space:pre-wrap;font-size:11px;color:#5A626B;background:#F2F4F5;border-radius:6px;padding:8px;margin:6px 0 0">${esc(e.detail.slice(0, 1200))}</pre>` : ""}
</li>`,
    )
    .join("");
  const html = `<!doctype html><html lang="de"><body style="margin:0;background:#F2F4F5;font-family:Segoe UI,Arial,sans-serif;color:#16191D">
<div style="max-width:620px;margin:0 auto;padding:24px 16px"><div style="font-weight:800;font-size:17px;margin-bottom:16px">Projektraum</div>
<div style="background:#fff;border:1px solid #DDE1E5;border-radius:12px;padding:20px 22px">
<h1 style="font-size:19px;margin:0 0 6px">${n === 1 ? "Bei jemandem ist ein Fehler aufgetreten" : `Bei jemandem sind ${n} Fehler aufgetreten`}</h1>
<p style="margin:0 0 14px;color:#5A626B">Du musst nichts tun – leite diese Mail einfach an Claude weiter, wenn du willst, dass es behoben wird.</p>
<ul style="padding-left:18px;margin:0">${items}</ul></div>
<p style="font-size:12px;color:#5A626B;margin:16px 4px">Gleiche Fehler werden höchstens einmal pro Tag gemeldet. <a href="${appUrl}" style="color:#1F5FBF">Projektraum öffnen</a></p>
</div></body></html>`;
  const text = errors.map((e) => `- ${e.message} (${WHERE[e.source] ?? e.source}, ${e.url}, ${e.count}x)\n${e.detail.slice(0, 600)}`).join("\n\n");
  return { subject, html, text: `Neue Fehler in Projektraum:\n\n${text}` };
}

/** Sicherungen, die älter als `keepDays` sind (Dateiname = JJJJ-MM-TT.json.gz) */
export function expiredBackups(names: string[], today: string, keepDays = 30) {
  const [y, m, d] = today.split("-").map(Number);
  const limit = new Date(Date.UTC(y, m - 1, d - keepDays)).toISOString().slice(0, 10);
  return names.filter((n) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n) && n.slice(0, 10) < limit);
}

export async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Ablageort der Kopie einer Datei aus "anhaenge" im Speicher "sicherungen" */
export const backupPath = (path: string) => `anhaenge/${path.replace(/^\/+/, "")}`;
