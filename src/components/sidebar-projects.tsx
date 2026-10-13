"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SidebarWorkspace } from "@/lib/queries";
import { createProject } from "@/app/(app)/actions";

export function SidebarProjects({ workspaces }: { workspaces: SidebarWorkspace[] }) {
  const pathname = usePathname();
  const [adding, setAdding] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {workspaces.map((ws) => (
        <section key={ws.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-1 pb-1">
            <h2 className="min-w-0">
              <Link
                href={`/w/${ws.id}`}
                aria-current={pathname === `/w/${ws.id}` ? "page" : undefined}
                className={`flex items-center gap-2 min-h-9 rounded-md px-1 -mx-1 text-xs font-bold uppercase tracking-wider hover:text-[#16191D] ${
                  pathname === `/w/${ws.id}` ? "text-[#16191D]" : "text-[#5A626B]"
                }`}
              >
                <span aria-hidden className="size-2 rounded-full shrink-0" style={{ background: ws.color }} />
                <span className="truncate">{ws.isPersonal ? ws.name : `${ws.orgName} · ${ws.name}`}</span>
              </Link>
            </h2>
            <button
              type="button"
              aria-label={`Neues Projekt in ${ws.name}`}
              onClick={() => setAdding(adding === ws.id ? null : ws.id)}
              className="size-8 rounded-lg border border-[#DDE1E5] flex items-center justify-center hover:bg-[#F2F4F5]"
            >
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {adding === ws.id && (
            <form action={createProject} className="flex gap-2 px-1 pb-2">
              <input type="hidden" name="workspace_id" value={ws.id} />
              <label className="sr-only" htmlFor={`new-${ws.id}`}>Projektname</label>
              <input
                id={`new-${ws.id}`}
                name="name"
                required
                autoFocus
                placeholder="Projektname"
                className="min-w-0 flex-1 h-10 rounded-lg border border-[#DDE1E5] px-3 text-sm"
              />
              <button type="submit" className="h-10 px-3 rounded-lg bg-[#16191D] text-white text-sm font-bold">
                Anlegen
              </button>
            </form>
          )}

          {ws.projects.length === 0 && adding !== ws.id && (
            <p className="px-2 text-sm text-[#5A626B]">Noch keine Projekte.</p>
          )}
          {ws.projects.map((p) => {
            const active = pathname === `/p/${p.id}`;
            return (
              <Link
                key={p.id}
                href={`/p/${p.id}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 min-h-11 px-2.5 rounded-lg text-sm ${
                  active ? "bg-[#EEF1F4] font-bold" : "hover:bg-[#F6F7F8]"
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
