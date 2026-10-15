"use client";

// Protokoll einfügen oder hochladen – daraus schlägt Projektraum Aufgaben vor.

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type ProtocolProject = { id: string; name: string; group: string };

const ACCEPT =
  ".pdf,.docx,.txt,.md,.vtt,.srt,.html,.jpg,.jpeg,.png,.webp,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac,.mp4,.mov,.webm,.mkv,application/pdf,audio/*,video/*,image/*,text/*";
const MAX = 50 * 1024 * 1024;

/** Antwort der Edge Function lesen (auch Fehlermeldungen) */
async function invokeError(e: unknown) {
  const ctx = (e as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const j = await ctx.json();
      if (j?.error) return String(j.error);
    } catch {}
  }
  return "Das Protokoll konnte nicht gesendet werden. Bitte später nochmal versuchen.";
}

export function ProtocolForm({ projects, initialProjectId, onDone }: { projects: ProtocolProject[]; initialProjectId?: string; onDone?: () => void }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<"text" | "file">("text");
  const [projectId, setProjectId] = useState(
    initialProjectId && projects.some((p) => p.id === initialProjectId) ? initialProjectId : projects.length === 1 ? projects[0].id : "",
  );
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.size > MAX) return setError(`„${f.name}“ ist zu groß (höchstens 50 MB). Bei langen Videos lade lieber nur den Ton oder das Transkript hoch.`);
    setFile(f);
    setMode("file");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!projectId) return setError("Bitte wähle das Projekt.");
    let body: Record<string, unknown>;
    if (mode === "text") {
      if (text.trim().length < 20) return setError("Bitte füge das Protokoll ein (mindestens ein paar Sätze).");
      body = { project_id: projectId, text };
      setBusy("Wird gesendet …");
    } else {
      if (!file) return setError("Bitte wähle eine Datei.");
      setBusy("Datei wird hochgeladen …");
      const { data: u } = await supabase.auth.getUser();
      const safe = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${u.user?.id}/${crypto.randomUUID()}-${safe}`;
      const up = await supabase.storage.from("protokolle").upload(path, file, { contentType: file.type || undefined });
      if (up.error) {
        setBusy(null);
        return setError("Hochladen hat nicht geklappt: " + up.error.message);
      }
      body = { project_id: projectId, file: { path, name: file.name, mime: file.type } };
      setBusy("Wird gesendet …");
    }
    const { data, error } = await supabase.functions.invoke("protokoll", { body });
    if (error || !data?.id) {
      setBusy(null);
      return setError(await invokeError(error));
    }
    onDone?.();
    router.push(`/protokolle/${data.id}`);
  }

  const tab = (m: "text" | "file", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => setMode(m)}
      className={`min-h-10 px-3 font-bold text-sm -mb-px border-b-[3px] ${mode === m ? "border-(--c-accent) text-(--c-ink)" : "border-transparent text-(--c-muted) hover:text-(--c-ink)"}`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      {(
        <label className="flex flex-col gap-1 text-sm font-semibold">
          In welches Projekt?
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-11 rounded-lg border border-(--c-line) bg-(--c-surface) px-3 font-normal">
            <option value="">Projekt wählen …</option>
            {[...new Set(projects.map((p) => p.group))].map((g) => (
              <optgroup key={g} label={g}>
                {projects.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      <div role="tablist" aria-label="Wie kommt das Protokoll?" className="flex gap-1 border-b border-(--c-line)">
        {tab("text", "Text einfügen")}
        {tab("file", "Datei hochladen")}
      </div>

      {mode === "text" ? (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Protokoll
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={"z. B.\nBesprechung 14. Okt.\n– Anna schickt das Angebot an Firma Huber bis Freitag\n– Werner klärt mit dem Notar den Termin …"}
            className="rounded-lg border border-(--c-line) p-3 font-normal text-sm resize-y"
          />
        </label>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={`rounded-xl border-2 border-dashed p-5 flex flex-col items-center gap-2 text-center ${drag ? "border-(--c-accent) bg-(--c-accent-soft)" : "border-(--c-line)"}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label="Protokoll-Datei auswählen"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {file ? (
            <p className="text-sm">
              <strong>{file.name}</strong> <span className="text-(--c-muted)">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
            </p>
          ) : (
            <p className="text-sm text-(--c-text-2)">Datei hierher ziehen oder auswählen</p>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} className="min-h-10 px-3.5 rounded-lg border border-(--c-line) text-sm font-semibold hover:bg-(--c-hover)">
            {file ? "Andere Datei wählen" : "Datei auswählen"}
          </button>
          <p className="text-xs text-(--c-muted)">PDF, Word, Text, Foto eines Protokolls, Ton- oder Videoaufnahme – bis 50 MB</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-(--c-danger)">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!!busy} className="h-11 px-5 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60">
          {busy ?? "Aufgaben vorschlagen lassen"}
        </button>
        <span className="text-xs text-(--c-muted)">Angelegt wird erst, wenn du die Vorschläge geprüft hast.</span>
      </div>
    </form>
  );
}
