// Inhalte der E-Mails – ohne Abhängigkeiten, damit sie sich leicht testen lassen.

export type OpenTask = {
  task_id: string;
  title: string;
  due_date: string | null;
  status: string;
  project_id: string;
  project_name: string;
};

export type Assignment = {
  outbox_id: number;
  user_id: string;
  task_id: string;
  title: string;
  due_date: string | null;
  project_id: string;
  project_name: string;
  actor_name: string;
};

export type Mail = { subject: string; html: string; text: string };

const MONTHS = ["Jän.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** Heutiges Datum und Stunde in Wien */
export function viennaNow(now = new Date()): { today: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Vienna",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]}`;
}

function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ------------------------------------------------------------- Bausteine
const C = { ink: "#16191D", muted: "#5A626B", line: "#DDE1E5", red: "#9A3412", blue: "#1F5FBF", bg: "#F2F4F5" };

function shell(title: string, body: string, appUrl: string): string {
  return `<!doctype html><html lang="de"><body style="margin:0;background:${C.bg};font-family:Segoe UI,Arial,sans-serif;color:${C.ink}">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-weight:800;font-size:17px;margin-bottom:16px">Projektraum</div>
<div style="background:#fff;border:1px solid ${C.line};border-radius:12px;padding:20px 22px">
<h1 style="font-size:20px;margin:0 0 14px">${esc(title)}</h1>
${body}
</div>
<p style="font-size:12px;color:${C.muted};margin:16px 4px;line-height:1.5">
Du bekommst diese E-Mail, weil du sie in Projektraum eingeschaltet hast.
Ändern oder abschalten kannst du das unter <a href="${appUrl}/einstellungen" style="color:${C.blue}">Benachrichtigungen</a>.
</p></div></body></html>`;
}

function taskRow(t: { title: string; due_date: string | null; project_id: string; project_name: string }, appUrl: string, today: string) {
  const overdue = t.due_date && t.due_date < today;
  const due = t.due_date
    ? `<span style="color:${overdue ? C.red : C.muted};font-weight:${overdue ? 700 : 400}">${overdue ? "überfällig seit " : "fällig "}${formatDate(t.due_date)}</span>`
    : "";
  return `<li style="margin:0 0 10px">
<a href="${appUrl}/p/${t.project_id}" style="color:${C.ink};font-weight:600;text-decoration:none">${esc(t.title)}</a><br>
<span style="font-size:13px;color:${C.muted}">${esc(t.project_name)}</span>${due ? `<span style="font-size:13px"> · ${due}</span>` : ""}
</li>`;
}

function group(label: string, tasks: OpenTask[], appUrl: string, today: string, color = C.ink) {
  if (!tasks.length) return "";
  return `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:${color};margin:18px 0 8px">${esc(label)} (${tasks.length})</h2>
<ul style="padding-left:18px;margin:0">${tasks.map((t) => taskRow(t, appUrl, today)).join("")}</ul>`;
}

function textGroup(label: string, tasks: OpenTask[]) {
  if (!tasks.length) return "";
  return `\n${label}:\n${tasks.map((t) => `- ${t.title} (${t.project_name}${t.due_date ? ", " + formatDate(t.due_date) : ""})`).join("\n")}\n`;
}

function button(appUrl: string, label = "Projektraum öffnen") {
  return `<p style="margin:20px 0 0"><a href="${appUrl}" style="display:inline-block;background:${C.ink};color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px">${label}</a></p>`;
}

// ------------------------------------------------------------- Tägliche Mail
/**
 * Baut die tägliche Mail. Gibt null zurück, wenn es nichts zu melden gibt.
 * mode "digest": Überblick über alles Offene. mode "due": nur heute und morgen Fälliges.
 */
export function dailyMail(mode: "digest" | "due", name: string, tasks: OpenTask[], today: string, appUrl: string): Mail | null {
  const tomorrow = addDays(today, 1);
  const in7 = addDays(today, 7);
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today);
  const dueToday = tasks.filter((t) => t.due_date === today);
  const dueTomorrow = tasks.filter((t) => t.due_date === tomorrow);
  const soon = tasks.filter((t) => t.due_date && t.due_date > tomorrow && t.due_date <= in7);
  const later = tasks.filter((t) => !t.due_date || t.due_date > in7);

  if (mode === "due") {
    if (!dueToday.length && !dueTomorrow.length) return null;
    const n = dueToday.length + dueTomorrow.length;
    const subject =
      dueToday.length && dueTomorrow.length
        ? `Heute und morgen fällig: ${n} Aufgaben`
        : dueToday.length
          ? `Heute fällig: ${dueToday.length === 1 ? dueToday[0].title : dueToday.length + " Aufgaben"}`
          : `Morgen fällig: ${dueTomorrow.length === 1 ? dueTomorrow[0].title : dueTomorrow.length + " Aufgaben"}`;
    const html = shell(
      `Hallo ${name}, das steht bald an`,
      group("Heute fällig", dueToday, appUrl, today, C.red) + group(`Morgen fällig (${weekday(tomorrow)})`, dueTomorrow, appUrl, today) + button(appUrl),
      appUrl,
    );
    const text = `Hallo ${name},\n${textGroup("Heute fällig", dueToday)}${textGroup("Morgen fällig", dueTomorrow)}\n${appUrl}\n`;
    return { subject, html, text };
  }

  if (!tasks.length) return null;
  const parts = [
    overdue.length && `${overdue.length} überfällig`,
    dueToday.length && `${dueToday.length} heute fällig`,
  ].filter(Boolean);
  const subject = `Dein Tag in Projektraum: ${tasks.length} offen${parts.length ? ", " + parts.join(", ") : ""}`;
  const body =
    `<p style="margin:0;color:${C.muted}">${weekday(today)}, ${formatDate(today)} · ${tasks.length} offene ${tasks.length === 1 ? "Aufgabe" : "Aufgaben"}</p>` +
    group("Überfällig", overdue, appUrl, today, C.red) +
    group("Heute fällig", dueToday, appUrl, today) +
    group("Morgen fällig", dueTomorrow, appUrl, today) +
    group("In den nächsten 7 Tagen", soon, appUrl, today) +
    (later.length
      ? `<p style="margin:18px 0 0;color:${C.muted};font-size:14px">Dazu ${later.length} weitere offene ${later.length === 1 ? "Aufgabe" : "Aufgaben"} ohne baldigen Termin.</p>`
      : "") +
    button(appUrl);
  const text =
    `Hallo ${name}, dein Überblick für ${weekday(today)}, ${formatDate(today)}:\n` +
    textGroup("Überfällig", overdue) +
    textGroup("Heute fällig", dueToday) +
    textGroup("Morgen fällig", dueTomorrow) +
    textGroup("In den nächsten 7 Tagen", soon) +
    (later.length ? `\nDazu ${later.length} weitere offene Aufgaben ohne baldigen Termin.\n` : "") +
    `\n${appUrl}\n`;
  return { subject, html: shell(`Guten Morgen, ${name}`, body, appUrl), text };
}

// ------------------------------------------------------------- Neue Zuordnung
/** Eine Mail je Person, auch wenn mehrere Aufgaben auf einmal zugeordnet wurden */
export function assignedMail(items: Assignment[], today: string, appUrl: string): Mail {
  const actors = [...new Set(items.map((i) => i.actor_name))];
  const who = actors.length === 1 ? actors[0] : "Dein Team";
  const subject =
    items.length === 1 ? `${who} hat dir eine Aufgabe zugeordnet: ${items[0].title}` : `${who} hat dir ${items.length} Aufgaben zugeordnet`;
  const body =
    `<p style="margin:0 0 12px">${esc(who)} hat dir ${items.length === 1 ? "eine neue Aufgabe" : items.length + " neue Aufgaben"} zugeordnet:</p>` +
    `<ul style="padding-left:18px;margin:0">${items.map((t) => taskRow(t, appUrl, today)).join("")}</ul>` +
    button(items.length === 1 ? `${appUrl}/p/${items[0].project_id}` : appUrl, items.length === 1 ? "Aufgabe ansehen" : "Projektraum öffnen");
  const text =
    `${who} hat dir ${items.length === 1 ? "eine neue Aufgabe" : items.length + " neue Aufgaben"} zugeordnet:\n` +
    items.map((t) => `- ${t.title} (${t.project_name}${t.due_date ? ", fällig " + formatDate(t.due_date) : ""})`).join("\n") +
    `\n\n${appUrl}\n`;
  return { subject, html: shell("Neue Aufgabe für dich", body, appUrl), text };
}
