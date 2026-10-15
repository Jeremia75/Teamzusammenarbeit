// Supabase Edge Function: Aufgaben aus Protokollen.
//
//   POST /protokoll        – aus der App (angemeldet): { project_id, text } oder { project_id, file: { path, name, mime } }
//   POST /protokoll/mail   – Webhook von Resend (eingehende E-Mail)
//
// Antwortet sofort mit der ID; das Lesen läuft im Hintergrund weiter. Die App fragt den Stand ab.
//
// Benötigte Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY     – für die KI (Pflicht)
//   ANTHROPIC_MODEL       – optional, Standard claude-sonnet-5-5
//   DEEPGRAM_API_KEY      – nur für Ton- und Videoaufnahmen
//   RESEND_API_KEY        – schon vorhanden; für E-Mails braucht der Schlüssel Vollzugriff ("Full access")
//   RESEND_WEBHOOK_SECRET – Signatur-Geheimnis des Resend-Webhooks (beginnt mit whsec_)
//   APP_URL, MAIL_FROM    – wie bei "benachrichtigungen"
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";
import {
  addressOf, contextText, docxXmlToText, htmlToText, imageMime, kindOf, replyMail, stripMailNoise, systemPrompt,
  newProjectOf, toSuggestions, TOOL, verifyWebhook, type Context, type Kind,
} from "./logic.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
/** Im Hintergrund weiterarbeiten (Supabase); lokal einfach laufen lassen */
const background = (p: Promise<unknown>) => (typeof EdgeRuntime !== "undefined" ? EdgeRuntime.waitUntil(p) : void p);

// Adressen der Dienste (nur für lokale Tests änderbar)
const ANTHROPIC = Deno.env.get("ANTHROPIC_URL") ?? "https://api.anthropic.com";
const RESEND = Deno.env.get("RESEND_URL") ?? "https://api.resend.com";
const DEEPGRAM = Deno.env.get("DEEPGRAM_URL") ?? "https://api.deepgram.com";

const BUCKET = "protokolle";
const MAX_TEXT = 300_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Fehler mit verständlicher Meldung für die Person. Mit `detail` wird er außerdem an die Fehlerüberwachung gemeldet
 *  (z. B. fehlender Schlüssel, Dienst antwortet nicht) – ohne `detail` ist es ein normaler Bedienfall (zu lang, kein Recht …). */
class Fail extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
  }
}

type Piece =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

type Input = { label: string; kind: Kind; text?: string; bytes?: Uint8Array; url?: string; mime?: string; name?: string };

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

/** An die Fehlerüberwachung melden (landet in app_errors und wird per E-Mail gemeldet). Darf selbst nie scheitern. */
async function report(msg: string, detail: unknown = "") {
  const d = detail instanceof Error ? (detail.stack ?? detail.message) : typeof detail === "string" ? detail : JSON.stringify(detail);
  console.error("Protokolle:", msg, d);
  try {
    await admin().rpc("report_error", { src: "function", msg: `Protokolle: ${msg}`, detail: String(d ?? "").slice(0, 4000), page: "protokoll" });
  } catch {}
}

function todayVienna() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
}

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------------------------------------------------------------- Ton und Video abschreiben

/** Namen, die beim Abschreiben besser erkannt werden sollen (Mitglieder, Projekte) */
function termsOf(ctx: Context) {
  const names = new Set<string>();
  for (const p of ctx.projects) {
    names.add(p.name);
    for (const m of p.mitglieder) for (const part of m.name.split(/\s+/)) if (part.length > 2) names.add(part);
  }
  return [...names].filter((n) => n.length <= 40).slice(0, 50);
}

async function transcribe(url: string, terms: string[] = []): Promise<string> {
  const key = Deno.env.get("DEEPGRAM_API_KEY");
  if (!key) throw new Fail("Ton- und Videoaufnahmen sind noch nicht eingerichtet (es fehlt der Schlüssel für das Abschreiben). Schick bitte das schriftliche Protokoll oder das Transkript.", "DEEPGRAM_API_KEY fehlt");
  for (const model of ["nova-3", "nova-2"]) {
    const q = new URLSearchParams({ model, language: "de", smart_format: "true", punctuate: "true", diarize: "true", paragraphs: "true" });
    // Namen vorab bekannt machen: nova-3 mit "keyterm", ältere Modelle mit "keywords"
    for (const t of terms) q.append(model === "nova-3" ? "keyterm" : "keywords", t);
    const r = await fetch(`${DEEPGRAM}/v1/listen?${q}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (r.status === 400 && model === "nova-3") continue;
    if (!r.ok) throw new Fail(`Die Aufnahme konnte nicht abgeschrieben werden (${r.status}).`, `Deepgram ${model} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    const alt = data?.results?.channels?.[0]?.alternatives?.[0];
    const text: string = alt?.paragraphs?.transcript ?? alt?.transcript ?? "";
    if (!text.trim()) throw new Fail("In der Aufnahme war keine Sprache zu hören.");
    return text.replace(/Speaker (\d+):/g, (_, n) => `Person ${Number(n) + 1}:`).trim();
  }
  throw new Fail("Die Aufnahme konnte nicht abgeschrieben werden.");
}

// ---------------------------------------------------------------- Inhalte für die KI

async function piecesOf(inputs: Input[], terms: string[] = []): Promise<{ pieces: Piece[]; transcript: string }> {
  const pieces: Piece[] = [];
  const texts: string[] = [];
  for (const it of inputs) {
    let text: string | null = null;
    if (it.kind === "pdf" && it.bytes) {
      if (it.bytes.length > 30 * 1024 * 1024) throw new Fail(`„${it.label}“ ist zu groß (höchstens 30 MB).`);
      pieces.push({ type: "text", text: `Datei „${it.label}“ (PDF):` });
      pieces.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(it.bytes) } });
      texts.push(`[PDF: ${it.label}]`);
      continue;
    }
    if (it.kind === "image" && it.bytes) {
      if (it.bytes.length > 5 * 1024 * 1024) throw new Fail(`Das Foto „${it.label}“ ist zu groß (höchstens 5 MB).`);
      pieces.push({ type: "text", text: `Foto „${it.label}“:` });
      pieces.push({ type: "image", source: { type: "base64", media_type: imageMime(it.mime, it.name), data: b64(it.bytes) } });
      texts.push(`[Foto: ${it.label}]`);
      continue;
    }
    if (it.kind === "docx" && it.bytes) {
      const files = unzipSync(it.bytes, { filter: (f) => f.name === "word/document.xml" });
      const xml = files["word/document.xml"];
      if (!xml) throw new Fail(`„${it.label}“ ist keine gültige Word-Datei.`);
      text = docxXmlToText(strFromU8(xml));
    } else if (it.kind === "html") {
      text = htmlToText(it.text ?? (it.bytes ? new TextDecoder().decode(it.bytes) : ""));
    } else if (it.kind === "text") {
      text = it.text ?? (it.bytes ? new TextDecoder().decode(it.bytes) : "");
    } else if (it.kind === "audio" || it.kind === "video") {
      if (!it.url) throw new Fail(`„${it.label}“ konnte nicht geladen werden.`);
      text = await transcribe(it.url, terms);
    } else {
      throw new Fail(`„${it.label}“: Dieses Dateiformat kann Projektraum nicht lesen. Möglich sind PDF, Word (.docx), Text, Fotos sowie Ton- und Videoaufnahmen.`);
    }
    text = (text ?? "").trim();
    if (!text) continue;
    pieces.push({ type: "text", text: `${it.label}:\n${text.slice(0, MAX_TEXT)}` });
    texts.push(`${it.label}:\n${text}`);
  }
  if (!pieces.length) throw new Fail("Im Protokoll war kein Text zu finden.");
  return { pieces, transcript: texts.join("\n\n").slice(0, MAX_TEXT) };
}

async function askAi(pieces: Piece[], ctx: Context, chooseProject: boolean) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Fail("Die KI ist noch nicht eingerichtet (es fehlt der Schlüssel). Bitte den Admin, ihn einzutragen.", "ANTHROPIC_API_KEY fehlt");
  const r = await fetch(`${ANTHROPIC}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
      max_tokens: 8000,
      system: systemPrompt(),
      tools: [TOOL],
      // Neuere Modelle erlauben kein erzwungenes Werkzeug – darum "auto" und eine klare Anweisung
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: contextText(ctx, todayVienna(), chooseProject) + "\n\nDas Protokoll:" },
            ...pieces,
            { type: "text", text: `Rufe jetzt das Werkzeug ${TOOL.name} genau einmal auf – auch wenn es keine Aufgaben gibt (dann mit leerer Liste). Schreib keinen anderen Text.` },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 300);
    throw new Fail(
      r.status === 401 ? "Der Schlüssel für die KI stimmt nicht." : r.status === 413 ? "Das Protokoll ist zu lang." : `Die KI hat nicht geantwortet (${r.status}). Bitte später nochmal versuchen.`,
      // "zu lang" liegt am Inhalt, nicht an der App – nicht melden
      r.status === 413 ? undefined : `KI ${r.status}: ${t}`,
    );
  }
  const data = await r.json();
  type Out = { projekt_id?: string; neues_projekt?: unknown; titel?: string; zusammenfassung?: string; aufgaben?: unknown };
  const blocks = (data.content ?? []) as { type: string; input?: unknown; text?: string }[];
  const use = blocks.find((c) => c.type === "tool_use");
  if (use?.input) return use.input as Out;
  // Ersatz: JSON im Text (falls das Modell das Werkzeug nicht benutzt hat)
  const text = blocks.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  const m = /\{[\s\S]*\}/.exec(text);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]) as Out;
      if (Array.isArray(parsed.aufgaben)) return parsed;
    } catch {}
  }
  throw new Fail("Die KI hat keine Aufgaben geliefert. Bitte nochmal versuchen.", `KI ohne Ergebnis: ${JSON.stringify(data).slice(0, 1500)}`);
}

// ---------------------------------------------------------------- Verarbeiten

async function processImport(sb: SupabaseClient, id: string, userId: string, projectId: string | null, inputs: Input[], cleanup: string[], mailTo?: { address: string; title: string }) {
  let title = mailTo?.title ?? inputs[0]?.label ?? "Protokoll";
  let count = 0;
  let failed: string | undefined;
  try {
    const { data: ctx, error } = await sb.rpc("protocol_context", { uid: userId, proj: projectId });
    if (error) throw new Error(error.message);
    const context = ctx as Context;
    if (!context.projects.length && (projectId || !context.bereiche?.length)) {
      throw new Fail(projectId ? "Du darfst in diesem Projekt keine Aufgaben anlegen." : "Du hast kein Projekt, in dem du Aufgaben anlegen darfst.");
    }
    const { pieces, transcript } = await piecesOf(inputs, termsOf(context));
    // Per E-Mail: die KI wählt das Projekt oder schlägt ein neues vor
    const choose = !projectId;
    const ai = await askAi(pieces, context, choose);
    const existing = projectId
      ? context.projects[0]
      : (context.projects.find((p) => p.id === ai.projekt_id) ?? null);
    const fresh = !projectId && !existing ? newProjectOf(ai, context) : null;
    const project = existing ?? (fresh || projectId ? null : context.projects.length === 1 ? context.projects[0] : null);
    const suggestions = toSuggestions(
      ai,
      project ?? (fresh ? { id: "", name: fresh.project.name, bereich: "", rubriken: [], meilensteine: [], mitglieder: fresh.members, offene_aufgaben: [] } : null),
    );
    count = suggestions.filter((s) => s.selected).length;
    if (ai.titel && !mailTo) title = String(ai.titel).slice(0, 200);
    const { error: e2 } = await sb
      .from("protocol_imports")
      .update({
        status: "ready",
        // Bei E-Mails bleibt der Betreff der Name, sonst der Vorschlag der KI
        title: (mailTo || !ai.titel ? title : String(ai.titel)).slice(0, 200),
        summary: String(ai.zusammenfassung ?? "").slice(0, 2000),
        transcript,
        suggestions,
        project_id: project?.id ?? null,
        new_project: fresh?.project ?? null,
      })
      .eq("id", id);
    if (e2) throw new Error(e2.message);
  } catch (e) {
    failed = e instanceof Fail ? e.message : "Beim Lesen ist etwas schiefgegangen. Bitte später nochmal versuchen.";
    if (!(e instanceof Fail)) await report("Protokoll konnte nicht gelesen werden", e);
    else if (e.detail) await report(e.message.replace(/\s*\(\d{3}\)/, ""), e.detail);
    const { error: e3 } = await sb.from("protocol_imports").update({ status: "failed", error: failed }).eq("id", id);
    if (e3) await report("Fehlerstand nicht gespeichert", e3.message);
  } finally {
    if (cleanup.length) {
      const { error: e4 } = await sb.storage.from(BUCKET).remove(cleanup);
      if (e4) await report("Hochgeladene Datei nicht gelöscht", `${cleanup.join(", ")}: ${e4.message}`);
    }
  }
  if (mailTo) await sendReply(sb, userId, mailTo.address, { title, count, id, failed });
}

async function sendReply(sb: SupabaseClient, userId: string, to: string, o: { title: string; count: number; id: string; failed?: string }) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  const appUrl = (Deno.env.get("APP_URL") ?? "https://teamzusammenarbeit.vercel.app").replace(/\/$/, "");
  const mail = replyMail({ name: prof?.display_name || "", title: o.title, count: o.count, link: `${appUrl}/protokolle/${o.id}`, failed: o.failed });
  const r = await fetch(`${RESEND}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("MAIL_FROM") ?? "Projektraum <onboarding@resend.dev>", to, subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!r.ok) await report("Antwort-Mail nicht verschickt", `Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

// ---------------------------------------------------------------- Aus der App

async function fromApp(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  const user = u?.user;
  if (!user) return json({ error: "Bitte melde dich an." }, 401);

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.project_id === "string" ? body.project_id : null;
  if (!projectId) return json({ error: "Projekt fehlt." }, 400);
  const { data: ctx } = await sb.rpc("protocol_context", { uid: user.id, proj: projectId });
  if (!(ctx as Context | null)?.projects?.length) return json({ error: "Du darfst in diesem Projekt keine Aufgaben anlegen." }, 403);

  const inputs: Input[] = [];
  const cleanup: string[] = [];
  let source: "text" | "file" = "text";
  let label = "Eingefügter Text";
  if (typeof body.text === "string" && body.text.trim()) {
    inputs.push({ label, kind: "text", text: body.text.slice(0, MAX_TEXT) });
  } else if (body.file && typeof body.file.path === "string") {
    const path: string = body.file.path;
    if (!path.startsWith(user.id + "/")) return json({ error: "Ungültige Datei." }, 400);
    source = "file";
    label = String(body.file.name ?? "Datei").slice(0, 200);
    const kind = kindOf(body.file.mime, body.file.name);
    cleanup.push(path);
    if (kind === "audio" || kind === "video") {
      const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      inputs.push({ label, kind, url: signed?.signedUrl, mime: body.file.mime, name: body.file.name });
    } else {
      const { data: blob, error } = await sb.storage.from(BUCKET).download(path);
      if (error || !blob) return json({ error: "Die Datei wurde nicht gefunden." }, 400);
      inputs.push({ label, kind, bytes: new Uint8Array(await blob.arrayBuffer()), mime: body.file.mime, name: body.file.name });
    }
  } else {
    return json({ error: "Bitte Text einfügen oder eine Datei wählen." }, 400);
  }

  const { data: row, error } = await sb
    .from("protocol_imports")
    .insert({ user_id: user.id, project_id: projectId, source, title: label })
    .select("id")
    .single();
  if (error) {
    await report("Protokoll nicht angelegt (App)", error.message);
    return json({ error: error.message }, 500);
  }
  background(processImport(sb, row.id, user.id, projectId, inputs, cleanup));
  return json({ id: row.id });
}

// ---------------------------------------------------------------- Per E-Mail (Resend)

async function fromMail(req: Request) {
  const raw = await req.text();
  const ok = await verifyWebhook(
    Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "",
    req.headers.get("svix-id") ?? req.headers.get("webhook-id"),
    req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp"),
    req.headers.get("svix-signature") ?? req.headers.get("webhook-signature"),
    raw,
  );
  if (!ok) return new Response("forbidden", { status: 403 });
  const event = JSON.parse(raw);
  if (event?.type !== "email.received" || !event.data?.email_id) return json({ ignored: true });

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    await report("E-Mail empfangen, aber RESEND_API_KEY fehlt");
    return json({ error: "RESEND_API_KEY fehlt" }, 500);
  }
  const sb = admin();
  const emailId: string = event.data.email_id;
  const from = addressOf(String(event.data.from ?? ""));
  const { data: uid } = await sb.rpc("protocol_user_by_email", { mail: from });
  // Unbekannte Absender: still ignorieren (keine Antwort, damit niemand Adressen abfragen kann)
  if (!uid) return json({ ignored: "unbekannter Absender" });

  const headers = { Authorization: `Bearer ${key}` };
  const [mailRes, attRes] = await Promise.all([
    fetch(`${RESEND}/emails/receiving/${emailId}`, { headers }),
    fetch(`${RESEND}/emails/receiving/${emailId}/attachments`, { headers }),
  ]);
  if (!mailRes.ok) {
    await report("E-Mail nicht abrufbar", `Resend ${mailRes.status}: ${(await mailRes.text()).slice(0, 300)}`);
    return json({ error: `E-Mail nicht abrufbar (${mailRes.status})` }, 502);
  }
  const mail = await mailRes.json();
  const atts: { filename?: string; content_type: string; content_disposition: string; size: number; download_url: string }[] = attRes.ok ? ((await attRes.json()).data ?? []) : [];

  const subject = String(mail.subject ?? "").replace(/^(fwd?|wg|aw|re):\s*/gi, "").trim() || "Protokoll per E-Mail";
  const inputs: Input[] = [];
  const bodyText = stripMailNoise(mail.text ? String(mail.text) : mail.html ? htmlToText(String(mail.html)) : "");
  if (bodyText.length > 15) inputs.push({ label: `E-Mail „${subject}“`, kind: "text", text: bodyText });
  for (const a of atts.slice(0, 10)) {
    const name = a.filename ?? "Anhang";
    const kind = kindOf(a.content_type, name);
    if (a.content_disposition === "inline" && kind === "image") continue; // Logos in Signaturen
    if (kind === "unknown") continue;
    if (kind === "audio" || kind === "video") {
      inputs.push({ label: name, kind, url: a.download_url, mime: a.content_type, name });
    } else {
      if (a.size > 30 * 1024 * 1024) continue;
      const r = await fetch(a.download_url);
      if (!r.ok) continue;
      inputs.push({ label: name, kind, bytes: new Uint8Array(await r.arrayBuffer()), mime: a.content_type, name });
    }
  }

  const { data: row, error } = await sb
    .from("protocol_imports")
    .insert({ user_id: uid, project_id: null, source: "mail", title: subject.slice(0, 200) })
    .select("id")
    .single();
  if (error) {
    await report("Protokoll nicht angelegt (E-Mail)", error.message);
    return json({ error: error.message }, 500);
  }
  if (!inputs.length) {
    await sb.from("protocol_imports").update({ status: "failed", error: "Die E-Mail enthielt keinen Text und keinen lesbaren Anhang." }).eq("id", row.id);
    await sendReply(sb, uid, from, { title: subject, count: 0, id: row.id, failed: "Die E-Mail enthielt keinen Text und keinen lesbaren Anhang." });
    return json({ id: row.id });
  }
  background(processImport(sb, row.id, uid, null, inputs, [], { address: from, title: subject }));
  return json({ id: row.id });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    return new URL(req.url).pathname.endsWith("/mail") ? await fromMail(req) : await fromApp(req);
  } catch (e) {
    await report("Interner Fehler", e);
    return json({ error: "Interner Fehler" }, 500);
  }
});
