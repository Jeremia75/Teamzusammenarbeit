"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ProjectStats } from "@/lib/queries";
import type { TaskStatus } from "@/lib/database.types";
import { byPosition, positionBetween } from "@/lib/ordering";
import { AddSection, ColumnHeader, DropLine, type BoardColumn } from "@/components/board";
import { EMPTY_STATS, ProjectTile } from "@/components/project-tile";
import { NewProjectTile } from "@/components/new-project-tile";
import { StatusBar } from "@/components/status-bar";

type P = { id: string; name: string; color: string; sectionId: string | null; position: number };
type S = { id: string; name: string; position: number };
type View = "board" | "tiles";

export function ProjectBoard({
  workspaceId,
  initialProjects,
  initialSections,
  stats,
}: {
  workspaceId: string;
  initialProjects: P[];
  initialSections: S[];
  stats: Record<string, ProjectStats>;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<P[]>(initialProjects);
  const [sections, setSections] = useState<S[]>(initialSections);
  const [view, setViewState] = useState<View>("board");
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ col: string; before: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Neue Daten vom Server (z. B. nach Anlegen eines Projekts) übernehmen
  useEffect(() => setProjects(initialProjects), [initialProjects]);
  useEffect(() => setSections(initialSections), [initialSections]);

  const viewKey = `projektraum:wsview:${workspaceId}`;
  useEffect(() => {
    try {
      const v = localStorage.getItem(viewKey);
      if (v === "board" || v === "tiles") setViewState(v);
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, [viewKey]);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(viewKey, v);
    } catch {
      /* ignorieren */
    }
  };

  const sorted = useMemo(() => [...sections].sort(byPosition), [sections]);
  const known = (id: string | null) => !!id && sections.some((s) => s.id === id);
  const columns: BoardColumn[] = [
    ...(sorted.length === 0 || projects.some((p) => !known(p.sectionId)) ? [{ key: "none", title: "Ohne Rubrik", sectionId: null }] : []),
    ...sorted.map((s) => ({ key: s.id, title: s.name, sectionId: s.id, editable: true, href: `/r/${s.id}` })),
  ];
  const projectsOf = (col: BoardColumn) =>
    projects.filter((p) => (col.sectionId ? p.sectionId === col.sectionId : !known(p.sectionId))).sort(byPosition);

  async function run(promise: PromiseLike<{ error: { message: string } | null }>, msg: string) {
    const { error } = await promise;
    if (error) setError(`${msg}: ${error.message}`);
    router.refresh();
  }

  function moveProject(id: string, col: BoardColumn, beforeId: string | null) {
    const others = projectsOf(col).filter((p) => p.id !== id);
    const position = positionBetween(others, beforeId);
    const sectionId = col.sectionId ?? null;
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, sectionId, position } : p)));
    run(supabase.from("projects").update({ section_id: sectionId, position }).eq("id", id), "Verschieben nicht gespeichert");
  }

  async function addSection(name: string) {
    const position = sorted.length ? sorted[sorted.length - 1].position + 1 : 1;
    const { data, error } = await supabase.from("project_sections").insert({ workspace_id: workspaceId, name, position }).select().single();
    if (error) return setError("Rubrik nicht angelegt: " + error.message);
    setSections((prev) => [...prev, { id: data.id, name: data.name, position: data.position }]);
    router.refresh();
  }
  function renameSection(id: string, name: string) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    run(supabase.from("project_sections").update({ name }).eq("id", id), "Umbenennen nicht gespeichert");
  }
  function deleteSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
    setProjects((prev) => prev.map((p) => (p.sectionId === id ? { ...p, sectionId: null } : p)));
    run(supabase.from("project_sections").delete().eq("id", id), "Löschen nicht gespeichert");
  }
  async function shiftSection(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex((s) => s.id === id);
    const a = sorted[idx];
    const b = sorted[idx + dir];
    if (!b) return;
    setSections((prev) => prev.map((s) => (s.id === a.id ? { ...s, position: b.position } : s.id === b.id ? { ...s, position: a.position } : s)));
    await supabase.from("project_sections").update({ position: b.position }).eq("id", a.id);
    run(supabase.from("project_sections").update({ position: a.position }).eq("id", b.id), "Reihenfolge nicht gespeichert");
  }

  function finish(col: BoardColumn) {
    if (dragId) moveProject(dragId, col, drop?.col === col.key ? drop.before : null);
    setDragId(null);
    setDrop(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#DDE1E5]">
        <div role="group" aria-label="Ansicht der Projekte" className="flex gap-1">
          {(
            [
              ["board", "Board · Rubriken"],
              ["tiles", "Kacheln"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`min-h-10 px-3 font-bold text-sm -mb-px border-b-[3px] ${
                view === v ? "border-[#1F5FBF] text-[#16191D]" : "border-transparent text-[#5A626B] hover:text-[#16191D]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg bg-[#FDE8E1] text-[#9A3412] px-4 py-2 text-sm font-semibold">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto underline min-h-10">
            Schließen
          </button>
        </div>
      )}

      {view === "tiles" ? (
        <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
          {columns.flatMap((c) => projectsOf(c)).map((p) => (
            <li key={p.id}>
              <ProjectTile project={p} stats={stats[p.id] ?? EMPTY_STATS} />
            </li>
          ))}
          <li>
            <NewProjectTile workspaceId={workspaceId} />
          </li>
        </ul>
      ) : (
        <div className="relative overflow-x-auto pb-2">
          <div className="flex gap-3.5 items-start">
            {columns.map((col, ci) => {
              const list = projectsOf(col);
              const sum = { todo: 0, doing: 0, review: 0, done: 0 } as Record<TaskStatus, number>;
              list.forEach((p) => {
                const s = stats[p.id] ?? EMPTY_STATS;
                (["todo", "doing", "review", "done"] as const).forEach((k) => (sum[k] += s[k]));
              });
              return (
                <section
                  key={col.key}
                  aria-label={col.title}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (drop?.col !== col.key) setDrop({ col: col.key, before: null });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    finish(col);
                  }}
                  className={`flex-[1_0_272px] max-w-[340px] rounded-xl p-2.5 flex flex-col gap-2 transition-colors ${
                    dragId && drop?.col === col.key ? "bg-[#DCE3EA]" : "bg-[#E8EBEE]"
                  }`}
                >
                  <ColumnHeader
                    col={col}
                    count={list.length}
                    statusColor={null}
                    isFirst={ci === 0 || !columns[ci - 1]?.editable}
                    isLast={ci === columns.length - 1}
                    onRename={renameSection}
                    onDelete={deleteSection}
                    onShift={shiftSection}
                  />
                  <div className="px-1.5 pb-1">
                    <StatusBar counts={sum} height={6} label={`Aufgaben in dieser Rubrik: ${sum.todo} offen, ${sum.doing} in Arbeit, ${sum.review} zur Prüfung, ${sum.done} erledigt`} />
                  </div>

                  {list.map((p, i) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", p.id);
                        setDragId(p.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDrop(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const before = e.clientY > r.top + r.height / 2 ? list[i + 1]?.id ?? null : p.id;
                        if (drop?.col !== col.key || drop.before !== before) setDrop({ col: col.key, before });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        finish(col);
                      }}
                      data-project={p.name}
                      className={dragId === p.id ? "opacity-40" : ""}
                    >
                      {dragId && dragId !== p.id && drop?.col === col.key && drop.before === p.id && <DropLine />}
                      <ProjectTile project={p} stats={stats[p.id] ?? EMPTY_STATS} compact />
                    </div>
                  ))}
                  {dragId && drop?.col === col.key && drop.before === null && <DropLine />}

                  <NewProjectTile workspaceId={workspaceId} sectionId={col.sectionId ?? null} compact />
                </section>
              );
            })}
            <AddSection onAdd={addSection} placeholder="z. B. Christlich, Arbeit, Familie" />
          </div>
        </div>
      )}
    </div>
  );
}
