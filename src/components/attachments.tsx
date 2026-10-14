"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Attachment } from "@/lib/database.types";

export const ATTACH_BUCKET = "anhaenge";
export const MAX_FILE = 25 * 1024 * 1024;

const sizeLabel = (n: number | null) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

const safeName = (n: string) =>
  n
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(-100) || "datei";

function kindOf(a: Attachment): { label: string; icon: string } {
  if (a.kind === "link") {
    const host = (() => {
      try {
        return new URL(a.url!).hostname.replace(/^www\./, "");
      } catch {
        return "Link";
      }
    })();
    return { label: host, icon: "link" };
  }
  const m = a.mime ?? "";
  if (m.startsWith("image/")) return { label: "Bild", icon: "image" };
  if (m === "application/pdf") return { label: "PDF", icon: "pdf" };
  if (/word|opendocument\.text|rtf/.test(m)) return { label: "Text", icon: "doc" };
  if (/sheet|excel|csv/.test(m)) return { label: "Tabelle", icon: "sheet" };
  if (/presentation|powerpoint/.test(m)) return { label: "Präsentation", icon: "doc" };
  return { label: "Datei", icon: "doc" };
}

function Icon({ name }: { name: string }) {
  const p = {
    link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m21 16-5-5-9 9" />
      </>
    ),
    pdf: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M8.5 16h1.3a1.2 1.2 0 0 0 0-2.4H8.5V18" />
      </>
    ),
    sheet: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M4 9h16M4 15h16M10 3v18" />
      </>
    ),
    doc: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </>
    ),
  }[name];
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {p}
    </svg>
  );
}

/** Abschnitt "Dateien und Links" im Aufgabenfenster */
export function Attachments({ taskId, onCount }: { taskId: string; onCount?: (n: number) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const countRef = useRef(onCount);
  countRef.current = onCount;

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("task_attachments").select("*").eq("task_id", taskId).order("created_at");
    if (error) return setError("Anhänge konnten nicht geladen werden: " + error.message);
    setItems(data);
    countRef.current?.(data.length);
    // Vorschaubilder für Fotos
    const imgs = data.filter((a) => a.kind === "file" && a.mime?.startsWith("image/") && a.storage_path);
    if (imgs.length) {
      const { data: urls } = await supabase.storage.from(ATTACH_BUCKET).createSignedUrls(imgs.map((a) => a.storage_path!), 3600);
      const map: Record<string, string> = {};
      urls?.forEach((u, i) => u.signedUrl && (map[imgs[i].id] = u.signedUrl));
      setThumbs(map);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(files: FileList | File[]) {
    setError(null);
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE) {
        setError(`„${f.name}“ ist größer als 25 MB. Große Dokumente besser als Link anhängen.`);
        continue;
      }
      setBusy(`„${f.name}“ wird hochgeladen …`);
      const path = `${taskId}/${crypto.randomUUID()}-${safeName(f.name)}`;
      const up = await supabase.storage.from(ATTACH_BUCKET).upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
      if (up.error) {
        setError(`„${f.name}“ konnte nicht hochgeladen werden: ${up.error.message}`);
        continue;
      }
      const { error } = await supabase
        .from("task_attachments")
        .insert({ task_id: taskId, kind: "file", name: f.name.slice(0, 200), storage_path: path, mime: f.type || null, size: f.size });
      if (error) {
        await supabase.storage.from(ATTACH_BUCKET).remove([path]);
        setError(`„${f.name}“ konnte nicht gespeichert werden: ${error.message}`);
      }
    }
    setBusy(null);
    load();
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let u = url.trim();
    if (!u) return setError("Bitte einen Link einfügen.");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    let host = "";
    try {
      if (/\s/.test(u)) throw new Error();
      host = new URL(u).hostname;
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) throw new Error();
    } catch {
      return setError("Das sieht nicht wie ein Link aus. Kopiere ihn am besten direkt aus der Adresszeile.");
    }
    const { error } = await supabase
      .from("task_attachments")
      .insert({ task_id: taskId, kind: "link", name: (name.trim() || host.replace(/^www\./, "")).slice(0, 200), url: u });
    if (error) return setError("Link nicht gespeichert: " + error.message);
    setUrl("");
    setName("");
    setLinkOpen(false);
    load();
  }

  async function open(a: Attachment) {
    if (a.kind === "link") return window.open(a.url!, "_blank", "noopener,noreferrer");
    // Fenster sofort öffnen (sonst blockt der Browser), Adresse danach setzen
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(ATTACH_BUCKET).createSignedUrl(a.storage_path!, 300);
    if (error || !data) {
      w?.close();
      return setError("Datei konnte nicht geöffnet werden: " + (error?.message ?? ""));
    }
    if (w) w.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  async function remove(a: Attachment) {
    setConfirm(null);
    setItems((prev) => prev?.filter((x) => x.id !== a.id) ?? prev);
    if (a.storage_path) await supabase.storage.from(ATTACH_BUCKET).remove([a.storage_path]);
    const { error } = await supabase.from("task_attachments").delete().eq("id", a.id);
    if (error) setError("Entfernen fehlgeschlagen: " + error.message);
    load();
  }

  const label = "text-xs font-bold uppercase tracking-wider text-(--c-muted)";

  return (
    <section
      aria-label="Dateien und Links"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        upload(e.dataTransfer.files);
      }}
      className={`flex flex-col gap-2 rounded-xl transition ${dragOver ? "outline-2 outline-dashed outline-(--c-accent) outline-offset-4 bg-(--c-accent-soft)" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={label}>Dateien und Links</span>
        {items && items.length > 0 && <span className="text-sm font-bold text-(--c-text-2)">{items.length}</span>}
      </div>

      {items && items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((a) => {
            const k = kindOf(a);
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border border-(--c-line) px-2.5 py-2 min-h-12">
                {thumbs[a.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs[a.id]} alt="" className="size-9 rounded-md object-cover shrink-0 border border-(--c-line)" />
                ) : (
                  <span className="size-9 rounded-md bg-(--c-hover) text-(--c-text-2) flex items-center justify-center shrink-0">
                    <Icon name={k.icon} />
                  </span>
                )}
                <button type="button" onClick={() => open(a)} className="min-w-0 flex-1 text-left flex flex-col">
                  <span className="text-sm font-semibold truncate text-(--c-accent) underline-offset-4 hover:underline">{a.name}</span>
                  <span className="text-xs text-(--c-muted) truncate">
                    {k.label}
                    {a.size != null ? ` · ${sizeLabel(a.size)}` : ""}
                  </span>
                </button>
                {confirm === a.id ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => remove(a)} className="min-h-9 px-2.5 rounded-md bg-(--c-danger) text-(--c-on-danger) text-xs font-bold">
                      Entfernen
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className="min-h-9 px-2 text-xs font-semibold">
                      Nein
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirm(a.id)}
                    aria-label={`${a.name} entfernen`}
                    className="size-9 shrink-0 rounded-md flex items-center justify-center text-(--c-muted) hover:bg-(--c-hover) hover:text-(--c-danger)"
                  >
                    <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {linkOpen ? (
        <form onSubmit={addLink} className="flex flex-col gap-2 rounded-lg border border-(--c-line) p-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Link
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              inputMode="url"
              placeholder="https://… (z. B. aus OneDrive oder Google Drive)"
              className="h-11 rounded-lg border border-(--c-line) px-3 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Name <span className="font-normal text-(--c-muted) -mt-1">optional, z. B. Gesellschaftsvertrag Entwurf</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-lg border border-(--c-line) px-3 font-normal" />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="h-10 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold">
              Link speichern
            </button>
            <button type="button" onClick={() => { setLinkOpen(false); setError(null); }} className="h-10 px-3 text-sm font-semibold">
              Abbrechen
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" multiple onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} className="sr-only" aria-label="Dateien auswählen" />
          <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className="min-h-10 px-3.5 rounded-lg border border-(--c-line) text-sm font-semibold hover:bg-(--c-hover) disabled:opacity-60">
            + Datei hinzufügen
          </button>
          <button type="button" onClick={() => setLinkOpen(true)} className="min-h-10 px-3.5 rounded-lg border border-(--c-line) text-sm font-semibold hover:bg-(--c-hover)">
            + Link hinzufügen
          </button>
        </div>
      )}

      {(busy || error || (items && items.length === 0 && !linkOpen)) && (
        <p role="status" className={`text-xs ${error ? "text-(--c-danger) font-semibold" : "text-(--c-muted)"}`}>
          {error ?? busy ?? "Du kannst Dateien auch einfach hierher ziehen. Bis 25 MB pro Datei."}
        </p>
      )}
    </section>
  );
}

type Supa = ReturnType<typeof createClient>;

/** Anzahl der Anhänge je Aufgabe für ein oder mehrere Projekte – mit Echtzeit */
export function useAttachmentCounts(supabase: Supa, projectIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = projectIds.join(",");
  const load = useCallback(async () => {
    if (!key) return;
    const { data } = await supabase.from("task_attachments").select("task_id, tasks!inner(project_id)").in("tasks.project_id", key.split(","));
    const c: Record<string, number> = {};
    data?.forEach((r) => (c[r.task_id] = (c[r.task_id] ?? 0) + 1));
    setCounts(c);
  }, [supabase, key]);
  useEffect(() => {
    load();
    if (!key) return;
    const ch = supabase
      .channel(`attachments-${key.slice(0, 60)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attachments" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, key, load]);
  const setCount = useCallback((taskId: string, n: number) => setCounts((prev) => (prev[taskId] === n ? prev : { ...prev, [taskId]: n })), []);
  return { counts, setCount };
}

/** Vor dem Löschen einer Aufgabe: hochgeladene Dateien entfernen (danach gibt es keinen Zugriff mehr) */
export async function removeTaskFiles(supabase: Supa, taskIds: string[]) {
  if (!taskIds.length) return;
  const { data } = await supabase.from("task_attachments").select("storage_path").in("task_id", taskIds).eq("kind", "file");
  const paths = (data ?? []).map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from(ATTACH_BUCKET).remove(paths);
}
