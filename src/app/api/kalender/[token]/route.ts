import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Kalender-Abo (iCal): Outlook, Google Kalender oder das Handy holen sich hier regelmäßig die Termine.
// Der lange Zufallsschlüssel in der Adresse ist der Zugang – eine Anmeldung ist nicht möglich.
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { todo: "Offen", doing: "In Arbeit", review: "Zur Prüfung", done: "Erledigt" };

/** Text für iCal maskieren */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Zeilen nach 75 Bytes umbrechen (iCal-Regel), ohne UTF-8-Zeichen zu zerteilen */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const ymd = (d: string) => d.replaceAll("-", "");
const nextDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10).replaceAll("-", "");
};

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{40,128}$/.test(token)) return new Response("Nicht gefunden", { status: 404 });

  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("calendar_feed", { tok: token });
  if (error) return new Response("Kalender gerade nicht verfügbar", { status: 503 });
  // Unbekannter oder erneuerter Schlüssel: ergibt einfach einen leeren Kalender

  const origin = new URL(req.url).origin;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Projektraum//Kalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Projektraum",
    "X-WR-TIMEZONE:Europe/Vienna",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of data ?? []) {
    const isTask = e.kind === "task";
    const done = e.status === "done";
    const summary = isTask ? `${done ? "✓ " : ""}${e.title} · ${e.project}` : `◆ ${e.title} (Meilenstein) · ${e.project}`;
    const url = isTask ? `${origin}/p/${e.project_id}?aufgabe=${e.id}` : `${origin}/p/${e.project_id}`;
    const desc = [isTask ? `Status: ${STATUS[e.status ?? ""] ?? ""}` : "Meilenstein", e.description ?? "", url].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.kind}-${e.id}@projektraum`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.start_date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.end_date)}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(desc)}`,
      `URL:${url}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="projektraum.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
