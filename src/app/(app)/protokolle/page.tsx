import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadEditableProjects } from "@/lib/queries";
import { ProtocolForm } from "@/components/protocol-form";
import { CopyField } from "@/components/copy-field";

export const metadata = { title: "Aus Protokollen · Projektraum" };

const STATUS: Record<string, { label: string; cls: string }> = {
  processing: { label: "Wird gelesen …", cls: "bg-(--c-hover) text-(--c-text-2)" },
  ready: { label: "Vorschläge prüfen", cls: "bg-(--c-accent) text-white" },
  done: { label: "Erledigt", cls: "bg-(--c-success-soft,var(--c-hover)) text-(--c-success-ink)" },
  failed: { label: "Nicht gelesen", cls: "bg-(--c-danger-soft) text-(--c-danger)" },
  dismissed: { label: "Verworfen", cls: "bg-(--c-hover) text-(--c-muted)" },
};
const SOURCE = { text: "Eingefügt", file: "Hochgeladen", mail: "Per E-Mail" } as const;

export default async function ProtocolsPage({ searchParams }: { searchParams: Promise<{ projekt?: string }> }) {
  const { projekt } = await searchParams;
  const supabase = await createClient();
  const [projects, { data: imports }, { data: mail }] = await Promise.all([
    loadEditableProjects(),
    supabase.from("protocol_imports").select("id, title, status, source, created_at, created_count, project_id, suggestions").order("created_at", { ascending: false }).limit(50),
    supabase.from("app_settings").select("value").eq("key", "protokoll_mail").maybeSingle(),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-7 py-8 flex flex-col gap-8">
      <header data-panel className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Aufgaben aus Protokollen</h1>
        <p className="text-(--c-text-2)">
          Gib Projektraum ein Besprechungsprotokoll – als Text, Datei, Foto oder Ton- bzw. Videoaufnahme. Projektraum schlägt daraus Aufgaben vor, mit
          Verantwortlichen und Terminen. Du prüfst und legst mit einem Klick an.
        </p>
      </header>

      <section data-panel aria-labelledby="neu" className="rounded-xl border border-(--c-line) bg-(--c-surface) p-5 flex flex-col gap-4">
        <h2 id="neu" className="text-lg font-bold">
          Neues Protokoll
        </h2>
        {projects.length === 0 ? (
          <p className="text-sm text-(--c-muted)">Du hast noch kein Projekt, in dem du Aufgaben anlegen darfst.</p>
        ) : (
          <ProtocolForm projects={projects} initialProjectId={projekt} />
        )}
      </section>

      <section data-panel aria-labelledby="mail" className="rounded-xl border border-(--c-line) bg-(--c-surface) p-5 flex flex-col gap-3">
        <h2 id="mail" className="text-lg font-bold">
          Per E-Mail schicken
        </h2>
        {mail?.value ? (
          <>
            <p className="text-sm text-(--c-text-2)">
              Leite ein Protokoll einfach an diese Adresse weiter – als Text in der Mail oder als Anhang. Schick es von der Adresse, mit der du dich bei
              Projektraum anmeldest. Du bekommst eine Antwort mit einem Link zu den Vorschlägen; Projektraum wählt das passende Projekt, du kannst es
              ändern.
            </p>
            <CopyField value={mail.value} label="Adresse für Protokolle" />
          </>
        ) : (
          <p className="text-sm text-(--c-muted)">Noch nicht eingerichtet. Bis dahin: Text einfügen oder Datei hochladen.</p>
        )}
      </section>

      <section aria-labelledby="bisher" className="flex flex-col gap-3">
        <h2 id="bisher" className="text-lg font-bold" data-panel="slim">
          Bisherige Protokolle
        </h2>
        {!imports?.length ? (
          <p data-panel="slim" className="text-sm text-(--c-muted)">Noch keine.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {imports.map((i) => {
              const st = STATUS[i.status];
              const n = Array.isArray(i.suggestions) ? i.suggestions.length : 0;
              return (
                <li key={i.id}>
                  <Link
                    href={`/protokolle/${i.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-(--c-line) bg-(--c-surface) px-4 py-3 hover:border-(--c-line-strong)"
                  >
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="font-semibold truncate">{i.title || "Protokoll"}</span>
                      <span className="text-xs text-(--c-muted)">
                        {SOURCE[i.source]} · {new Date(i.created_at).toLocaleString("de-AT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {i.project_id && projectName.get(i.project_id) ? ` · ${projectName.get(i.project_id)}` : ""}
                        {i.status === "done" ? ` · ${i.created_count} angelegt` : i.status === "ready" ? ` · ${n} ${n === 1 ? "Vorschlag" : "Vorschläge"}` : ""}
                      </span>
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
