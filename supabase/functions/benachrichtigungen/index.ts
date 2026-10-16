// Supabase Edge Function: verschickt die E-Mails von Projektraum.
// Wird alle 5 Minuten vom Zeitplan in der Datenbank aufgerufen (siehe Migration
// 20261013020100_benachrichtigungen_zeitplan.sql). Leert außerdem den Papierkorb nach 30 Tagen.
//
// Benötigte Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  – Schlüssel von resend.com
//   MAIL_FROM       – Absender, z. B. "Projektraum <projektraum@deine-domain.at>"
//   APP_URL         – optional, Standard https://teamzusammenarbeit.vercel.app
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { assignedMail, dailyMail, invitationMail, mentionMail, mondayOf, reminderMail, viennaNow, weeklyMail, type Assignment, type Invitation, type Mail, type Mention, type OpenTask, type Reminder, type WeekTeam } from "./mails.ts";
import { backupPath, errorMail, expiredBackups, gzip, type AppError } from "./waechter.ts";

const DAILY_HOUR = 7;
const WEEKLY_HOUR = 7; // Wochenrückblick montags ab 7 Uhr

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Nur der Zeitplan darf auslösen
  const { data: allowed } = await sb.rpc("notify_secret_ok", { s: req.headers.get("x-projektraum-secret") ?? "" });
  if (!allowed) return new Response("forbidden", { status: 403 });

  // 0) Papierkorb: nach 30 Tagen endgültig löschen – Dateipfade merken, Einträge löschen, dann die Dateien im Speicher
  let trashPurged = 0;
  try {
    const { data: files } = await sb.rpc("trash_expired_files");
    const paths = ((files ?? []) as { storage_path: string }[]).map((f) => f.storage_path).filter(Boolean);
    const { data: n, error } = await sb.rpc("trash_purge_expired");
    // Dateien nur entfernen, wenn die Einträge wirklich gelöscht wurden
    if (!error) {
      trashPurged = (n as number) ?? 0;
      for (let i = 0; i < paths.length; i += 100) await sb.storage.from("anhaenge").remove(paths.slice(i, i + 100));
    }
  } catch (e) {
    console.error("Papierkorb", e);
  }

  const { today, hour } = viennaNow();

  // 0b) Datensicherung: jede Nacht ab 2 Uhr einmal, 30 Tage aufbewahrt
  let backup = "";
  if (hour >= 2) {
    try {
      const name = `${today}.json.gz`;
      const { data: files } = await sb.storage.from("sicherungen").list("", { limit: 200 });
      const names = (files ?? []).map((f) => f.name);
      if (!names.includes(name)) {
        const { data: snap, error } = await sb.rpc("backup_snapshot");
        if (error) throw error;
        const up = await sb.storage.from("sicherungen").upload(name, await gzip(JSON.stringify(snap)), { contentType: "application/gzip" });
        if (up.error) throw up.error;
        backup = name;
      }
      const old = expiredBackups(names, today);
      if (old.length) await sb.storage.from("sicherungen").remove(old);
    } catch (e) {
      console.error("Sicherung", e);
      await sb.rpc("report_error", { src: "function", msg: "Datensicherung fehlgeschlagen", detail: String((e as Error)?.message ?? e) });
    }
  }

  // 0c) Dateien sichern: neue Anhänge laufend in "sicherungen/anhaenge/" kopieren,
  //     Kopien von gelöschten Dateien nach 30 Tagen entfernen
  const files = { copied: 0, removed: 0, failed: 0 };
  try {
    const { data: todo, error } = await sb.rpc("file_backup_todo");
    if (error) throw error;
    const { copy, remove } = todo as { copy: { path: string; size: number }[]; remove: string[] };
    const done: { path: string; size: number }[] = [];
    const problems: string[] = [];
    for (const f of copy) {
      try {
        const dl = await sb.storage.from("anhaenge").download(f.path);
        if (dl.error) throw dl.error;
        const up = await sb.storage.from("sicherungen").upload(backupPath(f.path), dl.data, { upsert: true, contentType: dl.data.type || undefined });
        if (up.error) throw up.error;
        done.push(f);
      } catch (e) {
        problems.push(`${f.path}: ${(e as Error)?.message ?? e}`);
      }
    }
    const gone = remove.map(backupPath);
    if (gone.length) {
      const r = await sb.storage.from("sicherungen").remove(gone);
      if (r.error) throw r.error;
    }
    if (done.length || remove.length) {
      const { error: e2 } = await sb.rpc("file_backup_done", { copied: done, removed: remove });
      if (e2) throw e2;
    }
    Object.assign(files, { copied: done.length, removed: remove.length, failed: problems.length });
    if (problems.length) {
      await sb.rpc("report_error", { src: "function", msg: "Dateien konnten nicht gesichert werden", detail: problems.slice(0, 10).join("\n") });
    }
  } catch (e) {
    console.error("Dateisicherung", e);
    await sb.rpc("report_error", { src: "function", msg: "Dateisicherung fehlgeschlagen", detail: String((e as Error)?.message ?? e) });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ trashPurged, backup, files, skipped: "RESEND_API_KEY fehlt – keine E-Mails verschickt" });
  const from = Deno.env.get("MAIL_FROM") ?? "Projektraum <onboarding@resend.dev>";
  const appUrl = (Deno.env.get("APP_URL") ?? "https://teamzusammenarbeit.vercel.app").replace(/\/$/, "");

  const emails = new Map<string, string | null>();
  async function emailOf(uid: string) {
    if (!emails.has(uid)) {
      const { data } = await sb.auth.admin.getUserById(uid);
      emails.set(uid, data.user?.email ?? null);
    }
    return emails.get(uid)!;
  }

  async function send(to: string, mail: Mail) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }

  const report = { trashPurged, backup, files, errorsMailed: 0, assigned: 0, daily: 0, invitations: 0, mentions: 0, reminders: 0, weekly: 0, errors: [] as string[] };

  // 0c) Neue Fehler per E-Mail melden
  try {
    const { data: errs } = await sb.from("app_errors").select("*").is("notified_at", null).order("created_at").limit(20);
    const { data: to } = await sb.from("app_settings").select("value").eq("key", "intern.fehler_mail").maybeSingle();
    if (errs?.length && to?.value) {
      await send(to.value, errorMail(errs as AppError[], appUrl));
      await sb.from("app_errors").update({ notified_at: new Date().toISOString() }).in("id", errs.map((e) => e.id));
      report.errorsMailed = errs.length;
    }
  } catch (e) {
    report.errors.push("Fehlermeldung: " + String(e));
  }

  // 1) Neue Zuordnungen – gesammelt je Person
  const { data: pending, error: pErr } = await sb.rpc("notify_pending_assignments");
  if (pErr) report.errors.push(pErr.message);
  const byUser = new Map<string, Assignment[]>();
  for (const a of (pending ?? []) as Assignment[]) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a]);
  for (const [uid, items] of byUser) {
    const ids = items.map((i) => i.outbox_id);
    try {
      const to = await emailOf(uid);
      if (to) await send(to, assignedMail(items, today, appUrl));
      await sb.rpc("notify_mark_outbox", { ids });
      report.assigned++;
    } catch (e) {
      await sb.rpc("notify_mark_outbox", { ids, err: String(e).slice(0, 500) });
      report.errors.push(String(e));
    }
  }

  // 0d) Einladungen an Personen ohne Konto – je Einladung eine Mail
  try {
    const { data: invs, error } = await sb.rpc("invitations_pending");
    if (error) throw error;
    for (const inv of (invs ?? []) as Invitation[]) {
      try {
        await send(inv.email, invitationMail(inv, appUrl));
        await sb.rpc("invitations_mark", { ids: [inv.id] });
        report.invitations++;
      } catch (e) {
        await sb.rpc("invitations_mark", { ids: [inv.id], err: String(e).slice(0, 500) });
        report.errors.push(`Einladung an ${inv.email}: ${String(e)}`);
      }
    }
  } catch (e) {
    report.errors.push("Einladungen: " + String(e));
  }

  // 1b) Erwähnungen, die nach 3 Minuten noch ungelesen sind – gesammelt je Person
  try {
    const { data: ments, error } = await sb.rpc("notify_pending_mentions");
    if (error) throw error;
    const byPerson = new Map<string, Mention[]>();
    for (const m of (ments ?? []) as Mention[]) byPerson.set(m.user_id, [...(byPerson.get(m.user_id) ?? []), m]);
    const sent: number[] = [];
    for (const [uid, items] of byPerson) {
      try {
        const to = await emailOf(uid);
        if (to) await send(to, mentionMail(items, appUrl));
        sent.push(...items.map((i) => i.id));
        report.mentions += items.length;
      } catch (e) {
        report.errors.push("Erwähnung: " + String(e));
      }
    }
    const { error: e2 } = await sb.rpc("notify_mark_mentions", { ids: sent });
    if (e2) throw e2;
  } catch (e) {
    report.errors.push("Erwähnungen: " + String(e));
  }

  // 2) Tägliche Mail ab 7 Uhr, einmal pro Tag
  if (hour >= DAILY_HOUR) {
    const { data: recipients, error: rErr } = await sb.rpc("notify_daily_recipients", { today });
    if (rErr) report.errors.push(rErr.message);
    for (const r of (recipients ?? []) as { user_id: string; daily_mode: "digest" | "due"; display_name: string }[]) {
      try {
        const { data: tasks, error } = await sb.rpc("notify_open_tasks", { uid: r.user_id });
        if (error) throw error;
        const mail = dailyMail(r.daily_mode, r.display_name, (tasks ?? []) as OpenTask[], today, appUrl);
        const to = await emailOf(r.user_id);
        if (mail && to) {
          await send(to, mail);
          report.daily++;
        }
        await sb.rpc("notify_mark_daily", { uid: r.user_id, today });
      } catch (e) {
        report.errors.push(String(e));
      }
    }
  }

  // 3) Erinnerungen, die jetzt fällig sind – eine Mail je Person
  try {
    const { data: due, error } = await sb.rpc("reminders_due");
    if (error) throw error;
    const byPerson = new Map<string, Reminder[]>();
    for (const r of (due ?? []) as Reminder[]) byPerson.set(r.user_id, [...(byPerson.get(r.user_id) ?? []), r]);
    for (const [uid, items] of byPerson) {
      try {
        const to = await emailOf(uid);
        if (to) await send(to, reminderMail(items, today, appUrl));
        const { error: e2 } = await sb.rpc("reminders_mark", { ids: items.map((i) => i.id) });
        if (e2) throw e2;
        report.reminders += items.length;
      } catch (e) {
        report.errors.push("Erinnerung: " + String(e));
      }
    }
  } catch (e) {
    report.errors.push("Erinnerungen: " + String(e));
  }

  // 4) Wochenrückblick: montags ab 7 Uhr, einmal pro Woche
  const weekStart = mondayOf(today);
  if (today === weekStart && hour >= WEEKLY_HOUR) {
    const { data: recipients, error: wErr } = await sb.rpc("notify_weekly_recipients", { week_start: weekStart });
    if (wErr) report.errors.push(wErr.message);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    for (const r of (recipients ?? []) as { user_id: string; display_name: string }[]) {
      try {
        const [{ data: review, error: e1 }, { data: open, error: e2 }] = await Promise.all([
          sb.rpc("notify_week_review", { uid: r.user_id, since }),
          sb.rpc("notify_open_tasks", { uid: r.user_id }),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        const rv = (review ?? { done: [], team: [] }) as { done: OpenTask[]; team: WeekTeam[] };
        const mail = weeklyMail(r.display_name, rv.done, (open ?? []) as OpenTask[], rv.team, today, appUrl);
        const to = await emailOf(r.user_id);
        if (mail && to) {
          await send(to, mail);
          report.weekly++;
        }
        await sb.rpc("notify_mark_weekly", { uid: r.user_id, today });
      } catch (e) {
        report.errors.push("Wochenrückblick: " + String(e));
      }
    }
  }

  // Fehler beim Versand auch in der Fehlerliste festhalten (werden beim nächsten Lauf gemailt)
  for (const msg of report.errors.slice(0, 5)) {
    await sb.rpc("report_error", { src: "function", msg: "E-Mail-Versand: " + msg.slice(0, 180), detail: msg });
  }

  return json(report);
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}
