// Supabase Edge Function: verschickt die E-Mails von Projektraum.
// Wird alle 5 Minuten vom Zeitplan in der Datenbank aufgerufen (siehe Migration
// 20261013020100_benachrichtigungen_zeitplan.sql). Leert außerdem den Papierkorb nach 30 Tagen.
//
// Benötigte Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  – Schlüssel von resend.com
//   MAIL_FROM       – Absender, z. B. "Projektraum <projektraum@deine-domain.at>"
//   APP_URL         – optional, Standard https://teamzusammenarbeit.vercel.app
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { assignedMail, dailyMail, viennaNow, type Assignment, type Mail, type OpenTask } from "./mails.ts";
import { errorMail, expiredBackups, gzip, type AppError } from "./waechter.ts";

const DAILY_HOUR = 7;

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

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ trashPurged, backup, skipped: "RESEND_API_KEY fehlt – keine E-Mails verschickt" });
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

  const report = { trashPurged, backup, errorsMailed: 0, assigned: 0, daily: 0, errors: [] as string[] };

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

  return json(report);
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}
