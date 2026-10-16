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
Ändern oder abschalten kannst du das unter <a href="${appUrl}/einstellungen" style="color:${C.blue}">E-Mail &amp; Kalender</a>.
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

// ------------------------------------------------------------- Erinnerung
export type Reminder = {
  id: number;
  user_id: string;
  task_id: string;
  title: string;
  due_date: string | null;
  status: string;
  project_id: string;
  project_name: string;
  remind_at: string;
};

/** Eine Mail je Person mit allen Erinnerungen, die gerade fällig sind */
export function reminderMail(items: Reminder[], today: string, appUrl: string): Mail {
  const one = items.length === 1 ? items[0] : null;
  const subject = one ? `Erinnerung: ${one.title}` : `Erinnerung an ${items.length} Aufgaben`;
  const link = (t: Reminder) => `${appUrl}/p/${t.project_id}?aufgabe=${t.task_id}`;
  const rows = items
    .map((t) => {
      const done = t.status === "done";
      return `<li style="margin:0 0 10px">
<a href="${link(t)}" style="color:${C.ink};font-weight:600;text-decoration:${done ? "line-through" : "none"}">${esc(t.title)}</a><br>
<span style="font-size:13px;color:${C.muted}">${esc(t.project_name)}${
        t.due_date ? ` · <span style="color:${t.due_date < today && !done ? C.red : C.muted}">fällig ${formatDate(t.due_date)}</span>` : ""
      }${done ? " · schon erledigt" : ""}</span>
</li>`;
    })
    .join("");
  const body =
    `<p style="margin:0 0 12px">Du wolltest an ${one ? "diese Aufgabe" : "diese Aufgaben"} erinnert werden:</p>` +
    `<ul style="padding-left:18px;margin:0">${rows}</ul>` +
    button(one ? link(one) : appUrl, one ? "Aufgabe öffnen" : "Projektraum öffnen");
  const text =
    `Du wolltest an ${one ? "diese Aufgabe" : "diese Aufgaben"} erinnert werden:\n` +
    items.map((t) => `- ${t.title} (${t.project_name}${t.due_date ? ", fällig " + formatDate(t.due_date) : ""})\n  ${link(t)}`).join("\n") +
    `\n`;
  return { subject, html: shellReminder("Erinnerung", body, appUrl), text };
}

/** Wie shell(), aber mit passendem Hinweis unten (Erinnerungen setzt man selbst bei der Aufgabe) */
function shellReminder(title: string, body: string, appUrl: string): string {
  return shell(title, body, appUrl).replace(
    /Du bekommst diese E-Mail[\s\S]*?<\/a>\./,
    "Du bekommst diese E-Mail, weil du bei der Aufgabe eine Erinnerung eingestellt hast. Ändern oder entfernen kannst du sie im Fenster der Aufgabe.",
  );
}

// ------------------------------------------------------------- Wochenrückblick
export type WeekTeam = { project_id: string; project_name: string; done: number; created: number; open: number };

/**
 * Montags: Rückblick auf die letzte Woche und Ausblick auf diese.
 * done: meine in den letzten 7 Tagen erledigten Aufgaben; open: meine offenen (wie in der täglichen Mail).
 * Gibt null zurück, wenn es gar nichts zu berichten gibt.
 */
export function weeklyMail(name: string, done: OpenTask[], open: OpenTask[], team: WeekTeam[], today: string, appUrl: string): Mail | null {
  const weekEnd = addDays(today, 6);
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const thisWeek = open.filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekEnd);
  const teamDone = team.reduce((s, p) => s + p.done, 0);
  if (!done.length && !overdue.length && !thisWeek.length && !teamDone) return null;

  const lastMon = addDays(today, -7);
  const lastSun = addDays(today, -1);
  const subject = `Dein Wochenrückblick: ${done.length} erledigt${overdue.length ? `, ${overdue.length} überfällig` : ""}${
    thisWeek.length ? `, ${thisWeek.length} diese Woche fällig` : ""
  }`;

  const praise =
    done.length >= 10 ? "Starke Woche!" : done.length >= 3 ? "Gut gemacht." : done.length ? "Es geht voran." : "Letzte Woche hast du nichts abgehakt.";
  const teamTable = team.length
    ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin:18px 0 8px">Im Team (${teamDone} erledigt)</h2>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<tr style="color:${C.muted};text-align:left"><th style="padding:4px 0;font-weight:600">Projekt</th><th style="padding:4px 8px;font-weight:600;text-align:right">erledigt</th><th style="padding:4px 8px;font-weight:600;text-align:right">neu</th><th style="padding:4px 0;font-weight:600;text-align:right">offen</th></tr>
${team
  .map(
    (p) =>
      `<tr style="border-top:1px solid ${C.line}"><td style="padding:6px 0"><a href="${appUrl}/p/${p.project_id}" style="color:${C.ink};text-decoration:none;font-weight:600">${esc(p.project_name)}</a></td><td style="padding:6px 8px;text-align:right">${p.done}</td><td style="padding:6px 8px;text-align:right">${p.created}</td><td style="padding:6px 0;text-align:right">${p.open}</td></tr>`,
  )
  .join("")}
</table>`
    : "";

  const body =
    `<p style="margin:0;color:${C.muted}">Woche vom ${formatDate(lastMon)} bis ${formatDate(lastSun)}</p>` +
    `<p style="margin:12px 0 0;font-size:16px"><strong>${done.length}</strong> ${done.length === 1 ? "Aufgabe" : "Aufgaben"} erledigt. ${praise}</p>` +
    group("Erledigt", done, appUrl, "0000-00-00", "#0E7C66") +
    group("Überfällig", overdue, appUrl, today, C.red) +
    group("Diese Woche fällig", thisWeek, appUrl, today) +
    teamTable +
    button(appUrl);
  const text =
    `Hallo ${name}, dein Rückblick auf die Woche vom ${formatDate(lastMon)} bis ${formatDate(lastSun)}:\n` +
    `${done.length} erledigt. ${praise}\n` +
    textGroup("Erledigt", done) +
    textGroup("Überfällig", overdue) +
    textGroup("Diese Woche fällig", thisWeek) +
    (team.length ? `\nIm Team:\n${team.map((p) => `- ${p.project_name}: ${p.done} erledigt, ${p.created} neu, ${p.open} offen`).join("\n")}\n` : "") +
    `\n${appUrl}\n`;
  return { subject, html: shell(`Hallo ${name}, deine Woche`, body, appUrl), text };
}

/** Montag der Woche, in der iso liegt */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sonntag
  return addDays(iso, -((wd + 6) % 7));
}

// ------------------------------------------------------------- Erwähnung
export type Mention = {
  id: number;
  user_id: string;
  task_id: string;
  title: string;
  project_id: string;
  project_name: string;
  actor_name: string;
  body: string;
  created_at: string;
};

/** Eine Mail je Person mit allen Erwähnungen, die noch ungelesen sind */
export function mentionMail(items: Mention[], appUrl: string): Mail {
  const link = (m: Mention) => `${appUrl}/p/${m.project_id}?aufgabe=${m.task_id}`;
  const actors = [...new Set(items.map((i) => i.actor_name))];
  const who = actors.length === 1 ? actors[0] : "Dein Team";
  const one = items.length === 1 ? items[0] : null;
  const subject = one ? `${who} hat dich erwähnt: ${one.title}` : `${who} hat dich ${items.length}-mal erwähnt`;
  const quote = (b: string) => esc(b.length > 280 ? b.slice(0, 278) + "…" : b);
  const rows = items
    .map(
      (m) => `<div style="margin:0 0 16px">
<div style="font-size:13px;color:${C.muted};margin-bottom:4px">${esc(m.actor_name)} bei <a href="${link(m)}" style="color:${C.ink};font-weight:600">${esc(m.title)}</a> · ${esc(m.project_name)}</div>
<div style="border-left:3px solid ${C.line};padding:4px 0 4px 12px;white-space:pre-wrap;font-size:15px;line-height:1.5">${quote(m.body)}</div>
</div>`,
    )
    .join("");
  const body = rows + button(one ? link(one) : appUrl, one ? "Antworten" : "Projektraum öffnen");
  const text =
    items.map((m) => `${m.actor_name} bei „${m.title}“ (${m.project_name}):\n${m.body}\n${link(m)}`).join("\n\n") + `\n`;
  return { subject, html: shell(one ? "Du wurdest erwähnt" : `Du wurdest ${items.length}-mal erwähnt`, body, appUrl), text };
}
