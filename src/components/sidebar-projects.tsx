"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SidebarWorkspace } from "@/lib/queries";
import { createProject } from "@/app/(app)/actions";
import { TemplateFields, todayIso, useCreateFromTemplate, useTemplates } from "@/components/project-template";

export function SidebarProjects({ workspaces }: { workspaces: SidebarWorkspace[] }) {
  const pathname = usePathname();
  const [adding, setAdding] = useState<string | null>(null);
  const [templates, setTemplates] = useTemplates(adding !== null);
  const [tpl, setTpl] = useState("");
  const [start, setStart] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const fromTemplate = useCreateFromTemplate();

  return (
    <div className="flex flex-col gap-6">
      {workspaces.map((ws) => (
        <section key={ws.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-1 pb-1">
            <h2 className="min-w-0">
              <Link
                href={`/w/${ws.id}`}
                aria-current={pathname === `/w/${ws.id}` ? "page" : undefined}
                className={`flex items-center gap-2 min-h-9 rounded-md px-1 -mx-1 text-xs font-bold uppercase tracking-wider hover:text-(--c-ink) ${
                  pathname === `/w/${ws.id}` ? "text-(--c-ink)" : "text-(--c-muted)"
                }`}
              >
                <span aria-hidden className="size-2 rounded-full shrink-0" style={{ background: ws.color }} />
                <span className="truncate">{ws.isPersonal ? ws.name : `${ws.orgName} · ${ws.name}`}</span>
              </Link>
            </h2>
            {ws.myRole === "editor" && (
            <button
              type="button"
              aria-label={`Neues Projekt in ${ws.name}`}
              onClick={() => setAdding(adding === ws.id ? null : ws.id)}
              className="size-8 rounded-lg border border-(--c-line) flex items-center justify-center hover:bg-(--c-bg)"
            >
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            )}
          </div>

          {adding === ws.id && (
            <form
              action={createProject}
              onSubmit={async (e) => {
                if (!tpl) return;
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                if (!name) return;
                setError(null);
                const err = await fromTemplate(tpl, ws.id, name, start, null);
                if (err) setError(err);
                else {
                  setAdding(null);
                  setTpl("");
                }
              }}
              className="flex flex-wrap gap-2 px-1 pb-2"
            >
              <input type="hidden" name="workspace_id" value={ws.id} />
              <label className="sr-only" htmlFor={`new-${ws.id}`}>Projektname</label>
              <input
                id={`new-${ws.id}`}
                name="name"
                required
                autoFocus
                placeholder="Projektname"
                className="min-w-0 flex-1 h-10 rounded-lg border border-(--c-line) px-3 text-sm"
              />
              <button type="submit" className="h-10 px-3 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold">
                Anlegen
              </button>
              {templates && templates.length > 0 && (
                <div className="basis-full">
                  <TemplateFields
                    templates={templates}
                    value={tpl}
                    onChange={setTpl}
                    start={start}
                    onStart={setStart}
                    onRemoved={(id) => {
                      setTemplates(templates.filter((t) => t.id !== id));
                      setTpl("");
                    }}
                  />
                </div>
              )}
              {error && <p role="alert" className="basis-full text-xs font-semibold text-(--c-danger)">{error}</p>}
            </form>
          )}

          {ws.projects.length === 0 && adding !== ws.id && (
            <p className="px-2 text-sm text-(--c-muted)">Noch keine Projekte.</p>
          )}
          {ws.projects.map((p) => {
            const active = pathname === `/p/${p.id}`;
            return (
              <Link
                key={p.id}
                href={`/p/${p.id}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 min-h-11 px-2.5 rounded-lg text-sm ${
                  active ? "bg-(--c-line-soft) font-bold" : "hover:bg-(--c-hover)"
                }`}
              >
                <span aria-hidden className="size-2.5 rounded-[3px] shrink-0" style={{ background: p.color }} />
                <span className="truncate">{p.name}</span>
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}
