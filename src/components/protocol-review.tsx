"use client";

// Vorschläge aus einem Protokoll prüfen, anpassen und als Aufgaben anlegen.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Milestone, ProtocolImport, Section, Suggestion, TaskPriority } from "@/lib/database.types";
import { PRIORITIES } from "@/lib/labels";
import { Avatar } from "@/components/avatar";
import type { ProtocolProject } from "@/components/protocol-form";

type Person = { id: string; name: string; color: string };

const field = "h-10 rounded-lg border border-(--c-line) px-2.5 bg-(--c-surface) text-sm";

export function ProtocolReview({ initial, projects, currentUserId }: { initial: ProtocolImport; projects: ProtocolProject[]; currentUserId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [imp, setImp] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>(Array.isArray(initial.suggestions) ? (initial.suggestions as unknown as Suggestion[]) : []);
  const [projectId, setProjectId] = useState(initial.project_id && projects.some((p) => p.id === initial.project_id) ? initial.project_id : "");
  const [people, setPeople] = useState<Person[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(initial.status === "done" ? initial.created_count : null);

  // Während des Lesens alle 2 Sekunden nachsehen
  useEffect(() => {
    if (imp.status !== "processing") return;
    const t = setInterval(async () => {
      const { data } = await supabase.from("protocol_imports").select("*").eq("id", imp.id).maybeSingle();
      if (data && data.status !== "processing") {
        setImp(data);
        setItems(Array.isArray(data.suggestions) ? (data.suggestions as unknown as Suggestion[]) : []);
        if (data.project_id && projects.some((p) => p.id === data.project_id)) setProjectId(data.project_id);
        router.refresh();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [imp.status, imp.id, supabase, projects, router]);

  // Mitarbeitende, Rubriken und Meilensteine des gewählten Projekts
  useEffect(() => {
    if (!projectId) return;
    let off = false;
    (async () => {
      const { data: p } = await supabase.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
      const [{ data: wm }, { data: pm }, { data: sec }, { data: ms }] = await Promise.all([
        supabase.from("workspace_members").select("user_id").eq("workspace_id", p?.workspace_id ?? ""),
        supabase.from("project_members").select("user_id").eq("project_id", projectId),
        supabase.from("sections").select("*").eq("project_id", projectId).order("position"),
        supabase.from("milestones").select("*").eq("project_id", projectId).order("position"),
      ]);
      const ids = [...new Set([...(wm ?? []), ...(pm ?? [])].map((x) => x.user_id))];
      const { data: prof } = ids.length ? await supabase.from("profiles").select("id, display_name, avatar_color").in("id", ids) : { data: [] };
      if (off) return;
      setPeople((prof ?? []).map((x) => ({ id: x.id, name: x.display_name || "Unbenannt", color: x.avatar_color })));
      setSections(sec ?? []);
      setMilestones(ms ?? []);
    })();
    return () => {
      off = true;
    };
  }, [projectId, supabase]);

  const patch = (key: string, p: Partial<Suggestion>) => setItems((list) => list.map((s) => (s.key === key ? { ...s, ...p } : s)));
  const chosen = items.filter((s) => s.selected && s.title.trim());
  const wrongProject = projectId !== (imp.project_id ?? "");

  async function create() {
    setError(null);
    if (!projectId) return setError("Bitte wähle zuerst das Projekt.");
    if (!chosen.length) return setError("Es ist keine Aufgabe ausgewählt.");
    setBusy("Aufgaben werden angelegt …");
    const { data: last } = await supabase.from("tasks").select("position").eq("project_id", projectId).is("parent_id", null).order("position", { ascending: false }).limit(1).maybeSingle();
    let pos = (last?.position ?? 0) + 1;
    const secIds = new Set(sections.map((s) => s.id));
    const msIds = new Set(milestones.map((m) => m.id));
    const peopleIds = new Set(people.map((p) => p.id));
    let n = 0;
    for (const s of chosen) {
      const desc = [s.description, s.quote ? `Aus dem Protokoll „${imp.title}“: „${s.quote}“` : `Aus dem Protokoll „${imp.title}“`].filter(Boolean).join("\n\n");
      const { data: t, error } = await supabase
        .from("tasks")
        .insert({
          project_id: projectId,
          title: s.title.trim().slice(0, 500),
          description: desc.slice(0, 10000),
          priority: s.priority,
          start_date: s.start_date,
          due_date: s.due_date,
          section_id: s.section_id && secIds.has(s.section_id) ? s.section_id : null,
          milestone_id: s.milestone_id && msIds.has(s.milestone_id) ? s.milestone_id : null,
          position: pos++,
          created_by: currentUserId,
        })
        .select("id")
        .single();
      if (error) {
        setBusy(null);
        setError(`„${s.title}“ nicht angelegt: ${error.message}`);
        break;
      }
      const who = s.assignees.filter((a) => peopleIds.has(a));
      if (who.length) await supabase.from("task_assignees").insert(who.map((user_id) => ({ task_id: t.id, user_id })));
      n++;
    }
    await supabase
      .from("protocol_imports")
      .update({ status: "done", created_count: imp.created_count + n, project_id: projectId, suggestions: items as unknown as ProtocolImport["suggestions"] })
      .eq("id", imp.id);
    setBusy(null);
    setCreated(n);
    setImp({ ...imp, status: "done", created_count: imp.created_count + n, project_id: projectId });
    router.refresh();
  }

  async function dismiss() {
    await supabase.from("protocol_imports").update({ status: "dismissed" }).eq("id", imp.id);
    router.push("/protokolle");
    router.refresh();
  }

  const project = projects.find((p) => p.id === projectId);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-7 py-8 flex flex-col gap-6">
      <header data-panel className="flex flex-col gap-1">
        <Link href="/protokolle" className="self-start text-sm font-semibold text-(--c-muted) hover:text-(--c-ink) hover:underline underline-offset-4">
          ← Aus Protokollen
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">{imp.title || "Protokoll"}</h1>
        {imp.summary && <p className="text-(--c-text-2) max-w-3xl">{imp.summary}</p>}
      </header>

      {imp.status === "processing" && (
        <div data-panel role="status" className="rounded-xl border border-(--c-line) bg-(--c-surface) p-6 flex items-center gap-3">
          <span aria-hidden className="size-5 rounded-full border-2 border-(--c-accent) border-t-transparent animate-spin" />
          <span>
            Projektraum liest das Protokoll und sucht nach Aufgaben … <span className="text-(--c-muted)">Bei Aufnahmen kann das ein bis zwei Minuten dauern.</span>
          </span>
        </div>
      )}

      {imp.status === "failed" && (
        <div data-panel role="alert" className="rounded-xl border border-(--c-line) bg-(--c-danger-soft) text-(--c-danger) p-5 flex flex-col gap-2">
          <strong>Das Protokoll konnte nicht gelesen werden.</strong>
          <span className="text-sm">{imp.error}</span>
          <Link href="/protokolle" className="self-start text-sm font-semibold underline">
            Nochmal versuchen
          </Link>
        </div>
      )}

      {created !== null && (
        <div data-panel role="status" className="rounded-xl border border-(--c-line) bg-(--c-surface) p-5 flex flex-wrap items-center gap-3">
          <strong>{created === 1 ? "1 Aufgabe angelegt." : `${created} Aufgaben angelegt.`}</strong>
          {projectId && (
            <Link href={`/p/${projectId}`} className="min-h-10 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold inline-flex items-center">
              Zum Projekt {project?.name}
            </Link>
          )}
        </div>
      )}

      {(imp.status === "ready" || imp.status === "done") && (
        <>
          <section data-panel aria-label="Projekt" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Anlegen im Projekt
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-11 min-w-64 rounded-lg border border-(--c-line) bg-(--c-surface) px-3 font-normal">
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
            {wrongProject && projectId && <span className="text-xs text-(--c-muted) pb-3">Rubriken, Meilensteine und Personen bitte kurz prüfen.</span>}
          </section>

          {items.length === 0 ? (
            <p data-panel className="rounded-xl border border-(--c-line) bg-(--c-surface) p-5 text-(--c-text-2)">Im Protokoll wurden keine Aufgaben gefunden.</p>
          ) : (
            <ul aria-label="Vorgeschlagene Aufgaben" className="flex flex-col gap-3">
              {items.map((s) => (
                <li
                  key={s.key}
                  className={`rounded-xl border bg-(--c-surface) p-4 flex gap-3 ${s.selected ? "border-(--c-accent-line-2,var(--c-accent))" : "border-(--c-line) opacity-70"}`}
                >
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={(e) => patch(s.key, { selected: e.target.checked })}
                    aria-label={`${s.title} anlegen`}
                    className="mt-3 size-5 accent-(--c-accent) shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                    <input
                      value={s.title}
                      onChange={(e) => patch(s.key, { title: e.target.value })}
                      aria-label="Titel"
                      className="h-10 rounded-lg px-2 -mx-2 font-bold text-base hover:bg-(--c-hover) focus:bg-(--c-surface) focus:outline-2 focus:outline-(--c-accent)"
                    />
                    {s.duplicate_of && (
                      <p className="text-xs font-semibold text-(--c-text-2)">Gibt es vielleicht schon: „{s.duplicate_of}“ – darum nicht angehakt.</p>
                    )}
                    {s.quote && <p className="text-sm text-(--c-muted) italic border-l-2 border-(--c-line) pl-2.5">„{s.quote}“</p>}
                    <div className="flex flex-wrap gap-2">
                      <label className="flex flex-col gap-0.5 text-xs font-semibold text-(--c-muted)">
                        Fällig
                        <input type="date" value={s.due_date ?? ""} onChange={(e) => patch(s.key, { due_date: e.target.value || null })} className={`${field} text-(--c-ink)`} />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs font-semibold text-(--c-muted)">
                        Priorität
                        <select value={s.priority} onChange={(e) => patch(s.key, { priority: e.target.value as TaskPriority })} className={`${field} text-(--c-ink)`}>
                          {PRIORITIES.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {sections.length > 0 && (
                        <label className="flex flex-col gap-0.5 text-xs font-semibold text-(--c-muted)">
                          Rubrik
                          <select value={s.section_id ?? ""} onChange={(e) => patch(s.key, { section_id: e.target.value || null })} className={`${field} text-(--c-ink)`}>
                            <option value="">Ohne Rubrik</option>
                            {sections.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {milestones.length > 0 && (
                        <label className="flex flex-col gap-0.5 text-xs font-semibold text-(--c-muted)">
                          Meilenstein
                          <select value={s.milestone_id ?? ""} onChange={(e) => patch(s.key, { milestone_id: e.target.value || null })} className={`${field} text-(--c-ink)`}>
                            <option value="">Kein Meilenstein</option>
                            {milestones.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    {people.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Verantwortlich für ${s.title}`}>
                        {people.map((p) => {
                          const on = s.assignees.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => patch(s.key, { assignees: on ? s.assignees.filter((x) => x !== p.id) : [...s.assignees, p.id] })}
                              className={`min-h-9 rounded-full pl-1 pr-3 flex items-center gap-1.5 text-xs font-semibold border ${
                                on ? "border-(--c-accent) bg-(--c-accent-soft)" : "border-(--c-line) hover:bg-(--c-hover)"
                              }`}
                            >
                              <Avatar member={p} size={24} />
                              {p.name}
                            </button>
                          );
                        })}
                        {s.unknown_people.length > 0 && (
                          <span className="text-xs text-(--c-muted)">Im Protokoll genannt, aber nicht im Projekt: {s.unknown_people.join(", ")}</span>
                        )}
                      </div>
                    )}
                    {s.description && (
                      <details>
                        <summary className="text-xs font-semibold text-(--c-muted) cursor-pointer">Beschreibung</summary>
                        <textarea
                          value={s.description}
                          onChange={(e) => patch(s.key, { description: e.target.value })}
                          rows={3}
                          className="mt-1 w-full rounded-lg border border-(--c-line) p-2.5 text-sm resize-y"
                        />
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="text-sm font-semibold text-(--c-danger)">
              {error}
            </p>
          )}
          <div data-panel="slim" className="flex flex-wrap items-center gap-3">
            {items.length > 0 && imp.status === "ready" && (
              <button type="button" onClick={create} disabled={!!busy || !chosen.length} className="h-11 px-5 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold disabled:opacity-60">
                {busy ?? (chosen.length === 1 ? "1 Aufgabe anlegen" : `${chosen.length} Aufgaben anlegen`)}
              </button>
            )}
            {imp.status === "ready" && (
              <button type="button" onClick={dismiss} className="h-11 px-4 rounded-lg border border-(--c-line) text-sm font-semibold hover:bg-(--c-hover)">
                Verwerfen
              </button>
            )}
          </div>
        </>
      )}

      {imp.transcript && (
        <details data-panel className="rounded-xl border border-(--c-line) bg-(--c-surface) px-4 py-3">
          <summary className="min-h-9 flex items-center cursor-pointer text-sm font-semibold">Gelesener Text</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm font-sans text-(--c-text-2) max-h-[60vh] overflow-y-auto">{imp.transcript}</pre>
        </details>
      )}
    </div>
  );
}
