import Link from "next/link";
import { headers } from "next/headers";
import { KiConnections } from "@/components/ki-connections";
import { CopyField } from "@/components/copy-field";

export const metadata = { title: "KI-Assistent · Projektraum" };

export default async function KiPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "teamzusammenarbeit.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/api/mcp`;

  return (
    <div className="px-4 sm:px-7 py-6 flex flex-col gap-6 max-w-2xl">
      <header data-panel className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">KI-Assistent</h1>
        <p className="text-(--c-text-2)">
          Verbinde Projektraum mit Claude. Dann kannst du im Chat schreiben, z. B. „Mach aus diesem Protokoll Aufgaben im Projekt Firmengründung“ –
          und Claude legt sie für dich an. Mehr dazu in der{" "}
          <Link href="/hilfe#ki" className="font-semibold text-(--c-accent) underline underline-offset-4">
            Hilfe
          </Link>
          .
        </p>
      </header>

      <section aria-labelledby="ki-setup" className="bg-(--c-surface) border border-(--c-line) rounded-xl p-5 sm:p-6 flex flex-col gap-4">
        <h2 id="ki-setup" className="text-lg font-extrabold">So verbindest du Claude</h2>
        <ol className="list-decimal pl-5 flex flex-col gap-2.5 text-sm text-(--c-text-2)">
          <li>
            Öffne Claude (im Browser auf claude.ai oder in der Claude-App am Computer) und geh zu <strong>Einstellungen → Konnektoren</strong> (englisch: Settings → Connectors).
          </li>
          <li>
            Klick auf <strong>Benutzerdefinierten Konnektor hinzufügen</strong> (Add custom connector). Als Name trägst du <strong>Projektraum</strong> ein, als Adresse
            diese hier:
            <CopyField value={url} label="Konnektor-Adresse" />
          </li>
          <li>
            Klick auf <strong>Verbinden</strong>. Es öffnet sich Projektraum: Melde dich an und klick auf <strong>Erlauben</strong>.
          </li>
          <li>Fertig. Ab jetzt kannst du Claude in jedem Chat bitten, Aufgaben anzulegen – auch in der Claude-App am Handy.</li>
        </ol>
        <p className="text-xs text-(--c-muted)">
          Bei einem Team- oder Firmenkonto von Claude fügt meist die Person mit Admin-Rechten den Konnektor einmal für alle hinzu. Danach klickt jede
          Person selbst auf Verbinden und meldet sich mit ihrem eigenen Projektraum-Konto an.
        </p>
      </section>

      <section aria-labelledby="ki-can" className="bg-(--c-surface) border border-(--c-line) rounded-xl p-5 sm:p-6 flex flex-col gap-3">
        <h2 id="ki-can" className="text-lg font-extrabold">Was Claude dann kann</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1.5 text-sm text-(--c-text-2)">
          <li>Aufgaben anlegen – auch viele auf einmal, mit Unteraufgaben, Fälligkeit, Priorität und Verantwortlichen</li>
          <li>Aufgaben ändern, verschieben, abhaken und kommentieren, Links anhängen</li>
          <li>Neue Projekte anlegen</li>
          <li>Fragen beantworten wie „Was ist bei mir diese Woche fällig?“</li>
        </ul>
        <p className="text-sm text-(--c-text-2)">
          <strong>Löschen kann Claude nichts.</strong> Claude sieht nur, was du auch siehst, und alles erscheint unter deinem Namen.
        </p>
      </section>

      <KiConnections />
    </div>
  );
}
