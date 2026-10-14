"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COLOR_FIELDS, PRESETS, contrast, needsPanels, type Appearance, type ColorKey } from "@/lib/appearance";
import { useAppearance, type BgImage } from "@/components/appearance-provider";
import { TaskCard } from "@/components/board";
import { StatusBar } from "@/components/status-bar";
import type { Task, TaskStatus } from "@/lib/database.types";

const BUCKET = "hintergruende";
const MAX_SIDE = 2560;

/** Bild im Browser verkleinern und als JPEG ausgeben – spart Speicher und Ladezeit */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Bild konnte nicht umgewandelt werden"))), "image/jpeg", 0.85));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const sample = (id: string, title: string, status: TaskStatus, extra: Partial<Task> = {}): Task => ({
  id, title, status, project_id: "p", parent_id: null, section_id: null, milestone_id: null, position: 1, priority: "medium",
  due_date: null, description: "", created_by: null, created_at: "", updated_at: "", completed_at: null,
  recurrence: null, recurrence_spawned: false, ...extra,
}) as Task;

const SAMPLE = [
  sample("s1", "Kartons besorgen", "todo", { priority: "high", due_date: "2026-01-05" }),
  sample("s2", "Mietvertrag kündigen", "doing"),
  sample("s3", "Strom ummelden", "review", { due_date: "2030-10-18" }),
  sample("s4", "Termin fixieren", "done"),
];

export function AppearanceEditor({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { saved, savedImage, live, liveImage, setLive, setLiveImage, markSaved } = useAppearance();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const draft = live;
  const dirty = !same(live, saved) || (liveImage?.path ?? null) !== (savedImage?.path ?? null);

  // Beim Verlassen ohne Speichern: Vorschau zurücksetzen, hochgeladenes Bild wieder entfernen
  const latest = useRef({ dirty, saved, savedImage, liveImage });
  latest.current = { dirty, saved, savedImage, liveImage };
  useEffect(
    () => () => {
      const l = latest.current;
      if (!l.dirty) return;
      if (l.liveImage && l.liveImage.path !== l.savedImage?.path) supabase.storage.from(BUCKET).remove([l.liveImage.path]);
      setLive(l.saved);
      setLiveImage(l.savedImage);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Warnung beim Schließen des Tabs mit ungespeicherten Änderungen
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const base: Appearance = draft ?? PRESETS[0].value;
  function update(patch: Partial<Appearance>) {
    setMsg(null);
    setLive({ ...base, ...patch });
  }
  function setColor(k: ColorKey, v: string) {
    update({ colors: { ...base.colors, [k]: v.toUpperCase() } });
  }
  const activePreset = draft ? PRESETS.find((p) => same(p.value, draft))?.id : "standard";

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setMsg({ ok: false, text: "Bitte ein Foto als JPG, PNG oder WebP wählen." });
    if (file.size > 25 * 1024 * 1024) return setMsg({ ok: false, text: "Das Bild ist größer als 25 MB. Bitte ein kleineres wählen." });
    setBusy(true);
    setMsg({ ok: true, text: "Bild wird vorbereitet …" });
    try {
      const blob = await shrink(file);
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signed.error || !signed.data) throw signed.error ?? new Error("Kein Link");
      // Ein vorher hochgeladenes, noch nicht gespeichertes Bild wieder entfernen
      if (liveImage && liveImage.path !== savedImage?.path) await supabase.storage.from(BUCKET).remove([liveImage.path]);
      setLiveImage({ path, url: signed.data.signedUrl });
      if (!draft) setLive(PRESETS.find((p) => p.id === "bild")!.value);
      setMsg({ ok: true, text: "Bild eingesetzt. Gefällt es dir, klick auf Speichern." });
    } catch (err) {
      setMsg({ ok: false, text: "Hochladen hat nicht geklappt: " + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  }

  function removeImage() {
    if (liveImage && liveImage.path !== savedImage?.path) supabase.storage.from(BUCKET).remove([liveImage.path]);
    setLiveImage(null);
    setMsg(null);
  }

  async function save() {
    setBusy(true);
    const img: BgImage | null = live ? liveImage : null;
    const { error } = await supabase
      .from("appearance_settings")
      .upsert({ user_id: userId, settings: live as unknown as never, image_path: img?.path ?? null });
    if (error) {
      setBusy(false);
      return setMsg({ ok: false, text: "Nicht gespeichert: " + error.message });
    }
    // Altes Bild aufräumen, wenn es ersetzt oder entfernt wurde
    const stale = [savedImage?.path, live ? null : liveImage?.path].filter((p): p is string => !!p && p !== img?.path);
    if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
    markSaved(live, img);
    setBusy(false);
    setMsg({ ok: true, text: live ? "Gespeichert. So sieht Projektraum jetzt für dich aus, auf allen Geräten." : "Gespeichert. Projektraum nutzt wieder die Standard-Darstellung." });
    router.refresh();
  }

  function discard() {
    if (liveImage && liveImage.path !== savedImage?.path) supabase.storage.from(BUCKET).remove([liveImage.path]);
    setLive(saved);
    setLiveImage(savedImage);
    setMsg(null);
  }

  // ------------------------------------------------------------ Lesbarkeit
  const checks = draft
    ? (() => {
        const c = draft.colors;
        const list: [string, number, number][] = [
          ["Schrift auf Karten", contrast(c.text, c.surf), 4.5],
          ["Leise Schrift auf Spalten", contrast(c.muted, c.col), 4.5],
          ["Leise Schrift auf Karten", contrast(c.muted, c.surf), 4.5],
        ];
        return list;
      })()
    : [];
  const bad = checks.filter(([, r, min]) => r < min);

  const opt = (on: boolean) =>
    `min-h-11 px-3.5 rounded-lg border text-sm font-semibold ${on ? "border-(--c-accent) bg-(--c-accent-soft) text-(--c-ink)" : "border-(--c-line) bg-(--c-surface) hover:bg-(--c-hover)"}`;
  const box = "bg-(--c-surface) border border-(--c-line) rounded-xl p-5 flex flex-col gap-4";
  const h2 = "text-lg font-bold";

  return (
    <div className="flex flex-col gap-5 pb-28">
      <section aria-labelledby="ap-start" className={box}>
        <h2 id="ap-start" className={h2}>Ausgangspunkt</h2>
        <p className="text-sm text-(--c-text-2) -mt-2">
          Wähle einen Stil als Grundlage. Danach kannst du jede Farbe und Form einzeln ändern. Alles wirkt sofort in der ganzen App.
        </p>
        <div role="group" aria-label="Stil" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={activePreset === "standard"} onClick={() => { setLive(null); setLiveImage(null); setMsg(null); }} className={opt(activePreset === "standard")}>
            Standard
          </button>
          {PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={activePreset === p.id} onClick={() => update(p.value)} className={opt(activePreset === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {!draft && (
          <p className="text-sm text-(--c-muted)">
            Standard heißt: Projektraum folgt dem Umschalter Hell, Dunkel oder Automatisch in der Seitenleiste.
          </p>
        )}
      </section>

      {draft && (
        <>
          <section aria-labelledby="ap-farben" className={box}>
            <h2 id="ap-farben" className={h2}>Farben</h2>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
              {COLOR_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-3 rounded-lg border border-(--c-line) p-2.5 cursor-pointer hover:bg-(--c-hover)">
                  <input
                    type="color"
                    aria-label={f.label}
                    value={draft.colors[f.key].toLowerCase()}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    className="size-10 shrink-0 cursor-pointer rounded-md border border-(--c-line-strong) bg-transparent p-0"
                  />
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold">{f.label}</span>
                    <span className="text-xs text-(--c-muted)">{f.hint} · {draft.colors[f.key]}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section aria-labelledby="ap-form" className={box}>
            <h2 id="ap-form" className={h2}>Form und Schrift</h2>
            <label className="flex flex-wrap items-center gap-3 text-sm font-semibold">
              <span className="w-28">Ecken</span>
              <input type="range" min={0} max={22} step={1} value={draft.radius} onChange={(e) => update({ radius: +e.target.value })} className="flex-[1_1_200px] max-w-xs accent-(--c-accent)" />
              <span className="w-28 font-normal text-(--c-muted)">{draft.radius === 0 ? "eckig" : draft.radius >= 16 ? "sehr rund" : `${draft.radius} px`}</span>
            </label>
            {(
              [
                ["Rahmen", "border", [["fein", "Fein"], ["keiner", "Keiner"], ["dick", "Dick mit Schatten"]]],
                ["Schrift", "font", [["sans", "Klar"], ["rund", "Rund und freundlich"], ["serif", "Klassisch"]]],
                ["Abstände", "density", [["kompakt", "Kompakt"], ["normal", "Normal"], ["luftig", "Luftig"]]],
              ] as const
            ).map(([label, key, options]) => (
              <div key={key} role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
                <span className="w-28 text-sm font-semibold">{label}</span>
                {options.map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={draft[key] === v} onClick={() => update({ [key]: v } as Partial<Appearance>)} className={opt(draft[key] === v)}>
                    {l}
                  </button>
                ))}
              </div>
            ))}
            <label className="flex items-center gap-3 text-sm font-semibold min-h-11 cursor-pointer">
              <input type="checkbox" checked={draft.tilt} onChange={(e) => update({ tilt: e.target.checked })} className="size-[18px] accent-(--c-accent)" />
              Karten leicht schief, wie auf einer Pinnwand
            </label>
          </section>

          <section aria-labelledby="ap-bild" className={box}>
            <h2 id="ap-bild" className={h2}>Hintergrundbild</h2>
            <p className="text-sm text-(--c-text-2) -mt-2">
              Ein eigenes Foto hinter allem. Nur du siehst es. Große Bilder verkleinert Projektraum automatisch.
            </p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="sr-only" aria-label="Hintergrundbild auswählen" />
            <div className="flex flex-wrap items-center gap-3">
              {liveImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={liveImage.url} alt="Dein Hintergrundbild" className="h-20 w-32 object-cover rounded-lg border border-(--c-line)" />
              )}
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="min-h-11 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60">
                {liveImage ? "Anderes Bild wählen" : "Bild hochladen"}
              </button>
              {liveImage && (
                <button type="button" onClick={removeImage} className="min-h-11 px-3 text-sm font-semibold text-(--c-danger)">
                  Bild entfernen
                </button>
              )}
            </div>
            {liveImage && (
              <label className="flex flex-wrap items-center gap-3 text-sm font-semibold">
                <span className="w-28">Bild abschwächen</span>
                <input type="range" min={0} max={90} step={5} value={draft.dim} onChange={(e) => update({ dim: +e.target.value })} className="flex-[1_1_200px] max-w-xs accent-(--c-accent)" />
                <span className="w-28 font-normal text-(--c-muted)">{draft.dim} %</span>
              </label>
            )}
          </section>

          <section aria-labelledby="ap-vorschau" className={box}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="ap-vorschau" className={h2}>So sehen Aufgaben aus</h2>
              {bad.length === 0 ? (
                <span role="status" className="text-sm font-semibold text-(--c-success-ink)">Alles gut lesbar</span>
              ) : (
                <span role="status" className="text-sm font-semibold text-(--c-danger)">
                  {bad.length === 1 ? "1 Stelle schwer lesbar" : `${bad.length} Stellen schwer lesbar`}
                </span>
              )}
            </div>
            <div className="rounded-xl bg-(--c-col) p-2.5 flex flex-col gap-2 max-w-sm">
              <div className="px-1.5 text-sm font-bold">Zuhause</div>
              <div className="px-1.5 pb-1">
                <StatusBar counts={{ todo: 1, doing: 1, review: 1, done: 1 }} height={6} />
              </div>
              {SAMPLE.map((t) => (
                <TaskCard key={t.id} task={t} colorful dragging={false} subtasks={[]} people={[]} milestone="" selected={false} onOpen={() => {}} onToggleDone={() => {}} onDragStart={() => {}} onDragEnd={() => {}} />
              ))}
            </div>
            {bad.length > 0 && (
              <ul className="text-sm flex flex-col gap-1">
                {bad.map(([l, r, min]) => (
                  <li key={l} className="text-(--c-danger)">
                    {l}: Kontrast {r.toFixed(1)} : 1, gut lesbar ab {min} : 1. Wähle eine dunklere oder hellere Farbe.
                  </li>
                ))}
              </ul>
            )}
            {needsPanels(draft, !!liveImage) && (
              <p className="text-sm text-(--c-text-2)">
                Dein Hintergrund ist kräftig. Damit alles gut lesbar bleibt, stehen Überschriften, Reiter und Hinweise auf der Seite in eigenen
                Feldern in der Kartenfarbe.
              </p>
            )}
            {liveImage && <p className="text-xs text-(--c-muted)">Wie gut Text direkt auf dem Foto lesbar ist, hängt vom Bild ab. Hilft „Bild abschwächen“ nicht, wähle ein ruhigeres Foto.</p>}
          </section>
        </>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-7 px-4 sm:px-7 py-3 bg-(--c-surface) border-t border-(--c-line) flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy || !dirty} className="min-h-11 px-5 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold disabled:opacity-50">
          Speichern
        </button>
        {dirty && (
          <button type="button" onClick={discard} disabled={busy} className="min-h-11 px-3 font-semibold text-(--c-text-2) hover:text-(--c-ink)">
            Änderungen verwerfen
          </button>
        )}
        <span role="status" className={`text-sm font-semibold ${msg ? (msg.ok ? "text-(--c-success-ink)" : "text-(--c-danger)") : "text-(--c-muted)"}`}>
          {msg ? msg.text : dirty ? "Noch nicht gespeichert – du siehst eine Vorschau." : ""}
        </span>
      </div>
    </div>
  );
}
