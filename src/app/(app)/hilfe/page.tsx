import Link from "next/link";
import { STATUSES, PRIORITIES } from "@/lib/labels";

export const metadata = { title: "Hilfe · Projektraum" };

/** So heißt ein Knopf oder Feld in der App – optisch wie ein kleiner Knopf */
function K({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-md border border-(--c-line-strong) bg-(--c-surface) px-1.5 py-px text-[0.92em] font-semibold text-(--c-ink)">
      {children}
    </span>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 bg-(--c-surface) border border-(--c-line) rounded-xl p-5 sm:p-6 flex flex-col gap-3">
      <h2 id={`${id}-h`} className="text-xl font-extrabold tracking-tight">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-[15.5px] leading-relaxed text-(--c-ink-2) [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1">
        {children}
      </div>
    </section>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-(--c-accent-soft) border border-(--c-accent-line) px-4 py-3 text-[15px] text-(--c-accent-ink)">
      <strong>Tipp:</strong> {children}
    </p>
  );
}

const TOPICS: [string, string][] = [
  ["aufbau", "So ist Projektraum aufgebaut"],
  ["start", "Deine ersten Schritte"],
  ["bereiche", "Privat und Firma"],
  ["projekte", "Projekte anlegen und ordnen"],
  ["rubrik-oeffnen", "Eine Rubrik öffnen"],
  ["suche", "Suchen"],
  ["woche", "Meine Woche"],
  ["aufgaben", "Aufgaben anlegen und bearbeiten"],
  ["dateien", "Dateien und Links anhängen"],
  ["unteraufgaben", "Unteraufgaben"],
  ["farben", "Was die Farben bedeuten"],
  ["ansichten", "Die Ansichten im Projekt"],
  ["zeitplan", "Der Zeitplan"],
  ["abhaengig", "Aufgaben, die aufeinander warten"],
  ["projekt-rubriken", "Rubriken im Projekt"],
  ["meilensteine", "Ziele und Meilensteine"],
  ["wiederholen", "Wiederkehrende Aufgaben"],
  ["team", "Im Team arbeiten"],
  ["mitteilungen", "Mitteilungen und @Erwähnungen"],
  ["benachrichtigungen", "E-Mail-Benachrichtigungen"],
  ["kalender", "Termine im Kalender"],
  ["darstellung", "Aussehen anpassen"],
  ["ki", "Aufgaben mit KI anlegen"],
  ["papierkorb", "Gelöscht? Der Papierkorb"],
  ["installieren", "Projektraum auf dem PC installieren"],
  ["fragen", "Häufige Fragen"],
];

export default function HelpPage() {
  return (
    <div className="px-4 sm:px-7 py-6 flex flex-col gap-6 max-w-4xl">
      <header data-panel className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Hilfe</h1>
        <p className="text-(--c-text-2) text-[16px] leading-relaxed max-w-2xl">
          Hier erfährst du Schritt für Schritt, wie Projektraum funktioniert. Du brauchst keine Erfahrung mit solchen Programmen.
          Lies am besten zuerst die ersten beiden Abschnitte. Den Rest kannst du nachschlagen, wenn du ihn brauchst.
        </p>
      </header>

      <nav aria-label="Inhalt der Hilfe" className="bg-(--c-surface) border border-(--c-line) rounded-xl p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-(--c-muted) mb-2">Inhalt</h2>
        <ol className="sm:columns-2 gap-x-10 list-decimal pl-6 text-[15px]">
          {TOPICS.map(([id, title]) => (
            <li key={id} className="py-1 break-inside-avoid">
              <a href={`#${id}`} className="font-semibold text-(--c-accent) hover:underline underline-offset-4">
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="aufbau" title="So ist Projektraum aufgebaut">
        <p>Projektraum ordnet deine Arbeit in vier Ebenen. Jede Ebene steckt in der nächstgrößeren.</p>
        <div aria-hidden className="flex flex-col gap-2 text-sm font-semibold">
          <div className="rounded-xl border-2 border-(--c-accent) bg-(--c-accent-soft) p-3">
            Bereich <span className="font-normal text-(--c-text-2)">z. B. Privat oder Beruflich</span>
            <div className="mt-2 rounded-lg border-2 border-(--c-success) bg-(--c-tint-done) p-3">
              Projekt <span className="font-normal text-(--c-text-2)">z. B. Umzug oder Firmengründung</span>
              <div className="mt-2 rounded-lg border-2 border-(--c-review) bg-(--c-tint-review) p-3">
                Aufgabe <span className="font-normal text-(--c-text-2)">z. B. Mietvertrag kündigen</span>
                <div className="mt-2 rounded-lg border-2 border-(--c-todo) bg-(--c-surface) p-3">
                  Unteraufgabe <span className="font-normal text-(--c-text-2)">z. B. Kündigungsfrist nachsehen</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <ul>
          <li>
            Ein <strong>Bereich</strong> trennt große Lebensbereiche, zum Beispiel Privates und Berufliches.
          </li>
          <li>
            Ein <strong>Projekt</strong> ist ein Vorhaben mit einem Ziel. Es enthält alle Aufgaben, die dafür nötig sind.
          </li>
          <li>
            Eine <strong>Aufgabe</strong> ist etwas, das du erledigen kannst, zum Beispiel einen Anruf oder ein Formular.
          </li>
          <li>
            Eine <strong>Unteraufgabe</strong> ist ein kleiner Schritt innerhalb einer Aufgabe.
          </li>
        </ul>
        <p>
          Zusätzlich kannst du Dinge in <strong>Rubriken</strong> sortieren. Eine Rubrik ist wie eine Spalte auf einer Pinnwand. Projekte
          kannst du in einem Bereich in Rubriken sortieren, Aufgaben in einem Projekt ebenso.
        </p>
      </Section>

      <Section id="start" title="Deine ersten Schritte">
        <ol>
          <li>
            Klicke links oben auf <K>Projektraum</K>. Du siehst jetzt die Übersicht mit allen deinen Bereichen.
          </li>
          <li>
            Klicke im Bereich <strong>Privat</strong> auf <K>+ Projekt hinzufügen</K>, gib einen Namen ein und klicke auf <K>Anlegen</K>.
          </li>
          <li>Das neue Projekt öffnet sich sofort. Hier stehen später alle Aufgaben dieses Projekts.</li>
          <li>
            Klicke in der Spalte <strong>Offen</strong> auf <K>+ Aufgabe hinzufügen</K>, schreib die Aufgabe hinein und drück die
            Eingabetaste.
          </li>
          <li>
            Klicke auf die Aufgabe. Es öffnet sich ein Fenster mit den Details. Dort kannst du ein Datum, eine Beschreibung und Unteraufgaben
            eintragen.
          </li>
          <li>Wenn du fertig bist, klicke auf den kleinen Kreis links neben der Aufgabe. Damit ist sie erledigt.</li>
        </ol>
        <Tip>Alles, was du änderst, speichert Projektraum sofort. Einen Speichern-Knopf gibt es nicht und brauchst du nicht.</Tip>
      </Section>

      <Section id="bereiche" title="Privat und Firma">
        <p>
          Jeder bekommt automatisch den Bereich <strong>Privat</strong>. Den siehst nur du. Niemand sonst kann ihn öffnen, auch nicht
          deine Kolleginnen und Kollegen.
        </p>
        <p>
          Für die Zusammenarbeit legst du eine Firma an. Solange du noch keine Firma hast, findest du unten in der Übersicht das Feld <K>Firma anlegen</K>. Gib den
          Namen der Firma ein und den Namen des ersten Bereichs, zum Beispiel Beruflich. Alles in der Firma kannst du mit anderen
          teilen.
        </p>
        <p>Links in der Seitenleiste siehst du alle Bereiche untereinander, darunter jeweils die Projekte.</p>
      </Section>

      <Section id="projekte" title="Projekte anlegen und ordnen">
        <p>In der Übersicht hat jeder Bereich drei Ansichten. Oben über den Projekten schaltest du um.</p>
        <ul>
          <li>
            <K>Board · Rubriken</K> zeigt deine Projekte in Spalten. Jede Spalte ist eine Rubrik, zum Beispiel Familie, Kirche oder
            Weiterbildung.
          </li>
          <li>
            <K>Kacheln</K> zeigt alle Projekte als große Karten nebeneinander.
          </li>
          <li>
            <K>Zeitplan</K> zeigt jedes Projekt als Balken, vom ersten bis zum letzten Termin, also Aufgaben und Meilensteine. Der dunkle Teil des Balkens ist
            erledigt, die Rauten sind Meilensteine. Rot umrandet heißt, dass es im Projekt überfällige Aufgaben gibt. Ein Klick öffnet das
            Projekt. Projekte ohne Termine stehen darunter.
          </li>
        </ul>
        <p>So arbeitest du mit den Rubriken:</p>
        <ul>
          <li>
            Eine neue Rubrik legst du mit <K>+ Rubrik hinzufügen</K> ganz rechts an.
          </li>
          <li>
            Ein Projekt verschiebst du, indem du es mit der Maus festhältst und in eine andere Spalte ziehst. Innerhalb einer Spalte
            kannst du die Reihenfolge genauso ändern.
          </li>
          <li>
            Über die drei Punkte <K>…</K> neben dem Namen einer Rubrik kannst du sie umbenennen, nach links oder rechts schieben oder
            löschen.
          </li>
          <li>
            Mit <K>+ Projekt hinzufügen</K> unten in einer Spalte landet das neue Projekt direkt in dieser Rubrik.
          </li>
        </ul>
        <p>
          Jede Projektkarte zeigt einen farbigen Balken. Daran siehst du auf einen Blick, wie viel schon erledigt ist. Mehr dazu unter{" "}
          <a href="#farben" className="font-semibold text-(--c-accent) underline underline-offset-4">
            Was die Farben bedeuten
          </a>
          .
        </p>
        <Tip>Löschst du eine Rubrik, bleiben die Projekte darin erhalten. Sie wandern in die Spalte Ohne Rubrik.</Tip>
        <p>
          <strong>Ein Projekt löschen:</strong> Öffne das Projekt und scroll ganz nach unten. Dort findest du <K>Projekt löschen</K>.
          Projektraum fragt noch einmal nach. Das Projekt kommt dann samt Aufgaben in den Papierkorb, wo du es 30 Tage lang
          zurückholen kannst. Löschen darf nur, wer das Projekt angelegt hat, oder wer in der Firma Admin ist.
        </p>
      </Section>

      <Section id="rubrik-oeffnen" title="Eine Rubrik öffnen">
        <p>
          Klicke auf eine freie Stelle der grauen Spalte oder auf den Namen der Rubrik. Dann siehst du alle Aufgaben aus allen Projekten
          dieser Rubrik auf einer Seite.
        </p>
        <ul>
          <li>
            <K>Board · Projekte</K> zeigt für jedes Projekt eine eigene Spalte.
          </li>
          <li>
            <K>Board · Status</K> sortiert alle Aufgaben danach, wie weit sie sind. Auf jeder Karte steht, zu welchem Projekt sie gehört.
          </li>
          <li>
            <K>Liste</K> zeigt alles als Tabelle.
          </li>
        </ul>
        <p>
          Mit dem Pfeil oben links, zum Beispiel <K>← Privat</K>, kommst du zurück.
        </p>
      </Section>

      <Section id="suche" title="Suchen">
        <p>
          Ganz oben links ist das Suchfeld. Du kannst es auch jederzeit mit <K>Strg</K> + <K>K</K> öffnen (am Mac <K>⌘</K> + <K>K</K>). Schon nach zwei
          Buchstaben findet Projektraum passende Projekte, Aufgaben (auch in der Beschreibung), Kommentare sowie Dateien und Links.
        </p>
        <p>Mit den Pfeiltasten wählst du einen Treffer aus, mit der Eingabetaste öffnest du ihn. Mit Esc schließt du die Suche wieder.</p>
      </Section>

      <Section id="woche" title="Meine Woche">
        <p>
          Ganz oben links findest du <K>Meine Woche</K>. Dort stehen alle Aufgaben, für die du verantwortlich bist, aus allen Projekten auf einen Blick.
          Aufgaben, die du angelegt und noch niemandem zugeteilt hast, sind auch dabei.
        </p>
        <p>
          Sortiert ist nach Fälligkeit: <strong>Überfällig</strong>, <strong>Heute</strong>, <strong>Morgen</strong>, <strong>Diese Woche</strong>,{" "}
          <strong>Nächste Woche</strong>, <strong>Später</strong> und <strong>Ohne Termin</strong>. Die rote Zahl neben „Meine Woche“ zeigt, wie viele
          Aufgaben heute oder schon früher fällig waren.
        </p>
        <p>Mit dem Kreis hakst du eine Aufgabe direkt ab. Ein Klick auf den Namen öffnet sie in ihrem Projekt.</p>
      </Section>

      <Section id="aufgaben" title="Aufgaben anlegen und bearbeiten">
        <p>
          Eine neue Aufgabe legst du im Projekt mit <K>+ Aufgabe hinzufügen</K> unten in einer Spalte an. Schreib den Text hinein und drück
          die Eingabetaste. Du kannst gleich die nächste eintippen.
        </p>
        <p>Klickst du auf eine Aufgabe, öffnet sich ein Fenster mit den Details. Am Handy füllt es den ganzen Bildschirm. Dort kannst du Folgendes einstellen:</p>
        <ul>
          <li>
            <strong>Titel</strong> und <strong>Beschreibung</strong>. In die Beschreibung passen Notizen, Telefonnummern oder Links.
          </li>
          <li>
            <strong>Status</strong>, also wie weit die Aufgabe ist.
          </li>
          <li>
            <strong>Fällig am</strong>, also bis wann sie erledigt sein soll. Ist das Datum vorbei, wird es rot.
          </li>
          <li>
            <strong>Priorität</strong>: {PRIORITIES.map((p) => p.label).join(", ")}. Hohe und niedrige Priorität stehen als kleines
            Schild auf der Karte.
          </li>
          <li>
            <strong>Verantwortlich</strong>, also wer sich darum kümmert.
          </li>
          <li>
            <strong>Kommentare</strong>, um dich mit anderen über die Aufgabe auszutauschen.
          </li>
        </ul>
        <p>
          Mit dem Kreuz oben rechts, der Taste Esc oder einem Klick neben das Fenster schließt du es wieder. Ganz unten in den Details findest du{" "}
          <K>Aufgabe löschen</K>. Projektraum fragt vorher noch einmal nach.
        </p>
      </Section>

      <Section id="dateien" title="Dateien und Links anhängen">
        <p>
          Zu jeder Aufgabe kannst du Dokumente ablegen. Öffne die Aufgabe und scroll zu <strong>Dateien und Links</strong>.
        </p>
        <ul>
          <li>
            Mit <K>+ Datei hinzufügen</K> wählst du eine Datei von deinem Computer oder Handy aus. Du kannst Dateien auch einfach mit der
            Maus in das Aufgabenfenster ziehen. Eine Datei darf bis zu 25 MB groß sein.
          </li>
          <li>
            Mit <K>+ Link hinzufügen</K> fügst du einen Link ein, zum Beispiel zu einem Dokument in OneDrive oder Google Drive. Gib ihm
            einen kurzen Namen, dann findest du ihn schneller.
          </li>
          <li>Ein Klick auf den Namen öffnet das Dokument in einem neuen Fenster.</li>
          <li>Mit dem Kreuz daneben entfernst du es wieder. Projektraum fragt vorher noch einmal nach.</li>
        </ul>
        <p>
          Auf der Karte im Board zeigt eine kleine Büroklammer mit Zahl, wie viele Dokumente an der Aufgabe hängen. Sehen können die
          Dokumente alle, die auch das Projekt sehen.
        </p>
        <Tip>
          Dokumente, an denen mehrere Leute weiterarbeiten, wie den Businessplan, hängst du am besten als Link an. Dann gibt es nur eine
          aktuelle Fassung. Hochladen lohnt sich für fertige Dinge wie einen Scan oder ein unterschriebenes PDF.
        </Tip>
        <p>Bei wiederkehrenden Aufgaben nimmt die nächste Aufgabe die Links mit, die Dateien nicht.</p>
        <p>
          Löschst du eine Aufgabe, bleiben ihre Dateien im Papierkorb erhalten. Erst wenn du sie dort endgültig löschst, zeigt dir Projektraum
          die Dateien noch einmal – mit <K>Speichern</K> oder <K>Alle speichern</K> legst du sie vorher auf deinem Gerät ab. Den Dokumenten hinter
          Links passiert nichts, die liegen ja woanders.
        </p>
      </Section>

      <Section id="unteraufgaben" title="Unteraufgaben">
        <p>
          Große Aufgaben teilst du am besten in kleine Schritte. Öffne dazu die Aufgabe und schreib unter <strong>Unteraufgaben</strong> in
          das Feld <K>Unteraufgabe hinzufügen</K>. Drück die Eingabetaste.
        </p>
        <p>Jede Unteraufgabe hakst du einzeln ab. Auf der Karte siehst du dann zum Beispiel 2/5, also zwei von fünf erledigt.</p>
      </Section>

      <Section id="farben" title="Was die Farben bedeuten">
        <p>Jede Aufgabe hat einen von vier Zuständen. Jeder Zustand hat eine feste Farbe:</p>
        <ul className="!list-none !pl-0 flex flex-col gap-1.5">
          {STATUSES.map((s, i) => (
            <li key={s.id} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-1.5 size-3.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span>
                <strong>{s.label}</strong>{" "}
                {
                  [
                    "heißt, du hast noch nicht angefangen.",
                    "heißt, jemand arbeitet gerade daran.",
                    "heißt, die Arbeit ist fertig und jemand soll noch drüberschauen.",
                    "heißt, die Aufgabe ist abgeschlossen.",
                  ][i]
                }
              </span>
            </li>
          ))}
        </ul>
        <p>
          Die Farben findest du an drei Stellen wieder. Auf der Aufgabenkarte als Streifen links, im Balken über jeder Spalte und im
          Balken auf jeder Projektkarte. Je mehr Grün im Balken, desto mehr ist erledigt.
        </p>
      </Section>

      <Section id="ansichten" title="Die Ansichten im Projekt">
        <p>In einem Projekt kannst du oben zwischen vier Ansichten wechseln. Die Aufgaben bleiben dieselben, nur die Anordnung ändert sich.</p>
        <ul>
          <li>
            <K>Board · Rubriken</K> zeigt deine eigenen Spalten, zum Beispiel Recherche, Behörden und Marketing. Die Farben zeigen dir, wie
            weit jede Aufgabe ist.
          </li>
          <li>
            <K>Board · Status</K> hat vier feste Spalten, von Offen bis Erledigt. Ziehst du eine Aufgabe in eine andere Spalte, ändert
            sich ihr Status.
          </li>
          <li>
            <K>Liste</K> zeigt alle Aufgaben als Tabelle. Angefangene stehen oben, danach geht es nach Fälligkeitsdatum.
          </li>
          <li>
            <K>Zeitplan</K> zeigt deine Aufgaben auf einem Kalender, siehe unten.
          </li>
        </ul>
        <p>
          Mit dem Häkchen <K>Nur meine Aufgaben</K> blendest du alles aus, wofür du nicht verantwortlich bist.
        </p>
        <Tip>Projektraum merkt sich auf deinem Gerät, welche Ansicht du zuletzt gewählt hast.</Tip>
      </Section>

      <Section id="zeitplan" title="Der Zeitplan">
        <p>
          Im <K>Zeitplan</K> ist jede Aufgabe ein Balken: Er beginnt am <strong>Beginn</strong> und endet am Tag, an dem die Aufgabe{" "}
          <strong>fällig</strong> ist. Beides trägst du im Aufgabenfenster ein. Die Aufgaben sind nach Rubriken sortiert, die Farbe zeigt den
          Status.
        </p>
        <ul>
          <li>Die rote Linie ist heute. Mit <K>Heute</K> springst du dorthin zurück.</li>
          <li>
            Mit <K>Wochen</K>, <K>Monate</K> und <K>Quartal</K> wählst du, wie viel Zeit du auf einmal siehst.
          </li>
          <li>
            <strong>Verschieben:</strong> Halte einen Balken mit der Maus fest und zieh ihn nach links oder rechts. Beim Ziehen siehst du die neuen
            Daten.
          </li>
          <li>
            <strong>Länger oder kürzer:</strong> Fass den Balken ganz am linken oder rechten Rand an und zieh.
          </li>
          <li>Ein Klick auf den Balken öffnet die Aufgabe.</li>
          <li>Meilensteine stehen ganz oben als schwarze Raute.</li>
          <li>
            Ein gestrichelter kleiner Balken heißt: Es gibt nur einen Fälligkeitstag, aber keinen Beginn. Rot umrandet heißt: überfällig.
          </li>
        </ul>
        <p>
          Aufgaben ganz ohne Datum stehen unter dem Zeitplan bei <K>Ohne Termin</K>. Mit <K>Ab heute einplanen</K> bekommen sie drei Tage ab
          heute. Danach ziehst du sie an die richtige Stelle.
        </p>
        <Tip>
          Ohne Maus geht es auch: Spring mit der Tab-Taste zu einem Balken, dann verschieben ihn die Pfeiltasten um einen Tag. Mit gedrückter Umschalttaste änderst du
          stattdessen die Dauer.
        </Tip>
        <p>
          <strong>Wer hat wann was zu tun?</strong> Mit <K>Nach Person</K> sortiert der Zeitplan die Aufgaben nach den Verantwortlichen. Hat eine
          Aufgabe mehrere, steht sie bei jeder Person. Unter dem Namen siehst du eine farbige Linie, wenn sich offene Aufgaben überschneiden: gelb
          heißt zwei gleichzeitig, rot drei oder mehr. So erkennst du schnell, wer gerade zu viel auf dem Tisch hat. Mit <K>Nach Rubrik</K> kommst
          du zurück.
        </p>
      </Section>

      <Section id="abhaengig" title="Aufgaben, die aufeinander warten">
        <p>
          Manche Aufgaben können erst beginnen, wenn eine andere fertig ist. Zum Beispiel kannst du erst zum Notar, wenn der Vertrag fertig ist. Das
          nennt man eine Abhängigkeit.
        </p>
        <ul>
          <li>
            Öffne die Aufgabe, die warten muss, und klick bei <strong>Wartet auf</strong> auf <K>+ Wartet auf …</K>. Wähl die Aufgabe aus, auf die sie
            wartet.
          </li>
          <li>Unten im Fenster siehst du auch, welche Aufgaben auf diese hier warten.</li>
          <li>Im Zeitplan verbindet ein Pfeil die beiden Balken. Ist der Pfeil rot, beginnt die wartende Aufgabe zu früh.</li>
          <li>
            Verschiebst du im Zeitplan eine Aufgabe nach hinten, fragt Projektraum: <K>Mitverschieben</K>? Dann rutschen alle wartenden Aufgaben so weit
            nach, dass es wieder passt. Die Dauer bleibt dabei gleich.
          </li>
        </ul>
        <Tip>Im Kreis warten geht nicht: Wartet A auf B, kann B nicht auf A warten. Projektraum sagt dir dann Bescheid.</Tip>
      </Section>

      <Section id="projekt-rubriken" title="Rubriken im Projekt">
        <p>
          Innerhalb eines Projekts kannst du eigene Spalten anlegen. Wechsle dazu auf <K>Board · Rubriken</K> und klicke auf{" "}
          <K>+ Rubrik hinzufügen</K>.
        </p>
        <ul>
          <li>Aufgaben ziehst du mit der Maus von einer Rubrik in die andere.</li>
          <li>Die Reihenfolge innerhalb einer Rubrik bestimmst du selbst, ebenfalls durch Ziehen.</li>
          <li>
            Über die drei Punkte <K>…</K> benennst du eine Rubrik um, verschiebst oder löschst sie. Die Aufgaben bleiben dabei erhalten.
          </li>
        </ul>
        <p>
          Du kannst die Rubrik auch in den Details einer Aufgabe auswählen, im Feld <strong>Rubrik</strong>.
        </p>
      </Section>

      <Section id="meilensteine" title="Ziele und Meilensteine">
        <p>
          Ein Meilenstein ist ein wichtiges Zwischenziel mit einem Datum, zum Beispiel Businessplan fertig bis 30. November. Du findest
          die Meilensteine oben im Projekt unter <strong>Ziele & Meilensteine</strong>.
        </p>
        <ol>
          <li>
            Klicke auf <K>+ Meilenstein</K>.
          </li>
          <li>
            Gib einen Namen und ein Datum ein und klicke auf <K>Anlegen</K>.
          </li>
          <li>
            Öffne eine Aufgabe und wähle im Feld <strong>Meilenstein</strong> aus, zu welchem Ziel sie gehört.
          </li>
        </ol>
        <p>
          Jeder Meilenstein zeigt mit einem Farbbalken, wie viele seiner Aufgaben erledigt sind. Klickst du auf einen Meilenstein, siehst
          du darunter nur noch seine Aufgaben. Ein zweiter Klick zeigt wieder alle.
        </p>
        <Tip>Legst du eine Aufgabe an, während ein Meilenstein ausgewählt ist, gehört sie gleich zu diesem Meilenstein.</Tip>
      </Section>

      <Section id="wiederholen" title="Wiederkehrende Aufgaben">
        <p>
          Manche Aufgaben kommen immer wieder, zum Beispiel jede Woche zwei Bewerbungen schreiben. Öffne die Aufgabe und wähle im Feld{" "}
          <strong>Wiederholen</strong>, wie oft sie wiederkommen soll: täglich, wöchentlich, alle 2 Wochen, monatlich oder jährlich.
        </p>
        <p>
          Hakst du die Aufgabe ab, legt Projektraum sofort die nächste an, mit dem nächsten Fälligkeitsdatum. Die erledigte bleibt als
          erledigt stehen. Zuständige und Unteraufgaben übernimmt die neue Aufgabe.
        </p>
        <p>Wiederkehrende Aufgaben erkennst du an einem kleinen Pfeil-Kreis auf der Karte.</p>
        <Tip>Stell ein Fälligkeitsdatum ein, zum Beispiel den Freitag. Dann ist auch die nächste Aufgabe an einem Freitag fällig. Ohne Datum rechnet Projektraum ab dem Tag, an dem du abhakst.</Tip>
      </Section>

      <Section id="team" title="Im Team arbeiten">
        <p>
          <strong>Jemanden einladen.</strong> Die Person legt sich zuerst selbst ein Konto in Projektraum an. Danach öffnest du in der
          Übersicht unter dem Firmenbereich <K>Mitglieder verwalten</K>, trägst ihre E-Mail-Adresse ein und klickst auf{" "}
          <K>Hinzufügen</K>. Ab dann sieht sie alle Projekte dieses Bereichs. Deinen privaten Bereich sieht sie nie.
        </p>
        <p>
          <strong>Aufgaben verteilen.</strong> Öffne eine Aufgabe und klicke unter <strong>Verantwortlich</strong> auf die Person. Ihr
          farbiger Kreis mit den Anfangsbuchstaben erscheint dann auf der Karte. Mehrere Personen sind möglich.
        </p>
        <p>
          <strong>Gleichzeitig arbeiten.</strong> Ändert jemand etwas, siehst du es nach kurzer Zeit auch bei dir, ohne die Seite neu zu
          laden.
        </p>
        <p>
          <strong>Absprechen.</strong> Nutze die Kommentare in einer Aufgabe. So bleibt alles, was zu einer Aufgabe besprochen wurde, an
          einer Stelle.
        </p>
      </Section>

      <Section id="mitteilungen" title="Mitteilungen und @Erwähnungen">
        <p>
          Links oben unter <K>Mitteilungen</K> siehst du, was sich bei deinen Aufgaben getan hat. Die blaue Zahl zeigt, wie viel du noch nicht gelesen hast.
          Du bekommst eine Mitteilung, wenn
        </p>
        <ul>
          <li>dir jemand eine Aufgabe zuteilt,</li>
          <li>dich jemand in einem Kommentar erwähnt,</li>
          <li>jemand eine Aufgabe kommentiert, für die du verantwortlich bist oder die du angelegt hast,</li>
          <li>jemand so eine Aufgabe erledigt.</li>
        </ul>
        <p>
          Was du selbst tust, löst keine Mitteilung bei dir aus. Ein Klick auf eine Mitteilung öffnet die Aufgabe. Mit <K>Alle gelesen</K> räumst du auf.
        </p>
        <p>
          <strong>Jemanden erwähnen:</strong> Schreib im Kommentarfeld ein <K>@</K> und die ersten Buchstaben des Namens. Es erscheint eine Auswahl. Wähl die
          Person mit der Maus oder mit den Pfeiltasten und der Eingabetaste. Der Name wird im Kommentar blau hervorgehoben, und die Person bekommt eine
          Mitteilung. Erwähnen kannst du alle, die im selben Bereich mitarbeiten.
        </p>
      </Section>

      <Section id="benachrichtigungen" title="E-Mail-Benachrichtigungen">
        <p>
          Projektraum kann dich per E-Mail an deine Aufgaben erinnern. Sobald du deine erste Aufgabe hast, fragt Projektraum dich einmal,
          ob du das möchtest. Ändern kannst du es jederzeit links in der Seitenleiste unter <K>E-Mail &amp; Kalender</K>.
        </p>
        <p>Du kannst zwei Dinge einstellen.</p>
        <ol>
          <li>
            <strong>Eine regelmäßige E-Mail.</strong> Wähle eine von drei Möglichkeiten:
            <ul>
              <li>
                <K>Jeden Morgen einen Überblick</K>. Um 7 Uhr bekommst du eine Liste mit allem, was überfällig ist, was heute und morgen
                fällig ist und was in den nächsten 7 Tagen ansteht.
              </li>
              <li>
                <K>Nur kurz vor einem Termin</K>. Du bekommst nur dann eine E-Mail, wenn eine Aufgabe morgen oder heute fällig ist. An
                Tagen ohne Termin kommt nichts.
              </li>
              <li>
                <K>Keine regelmäßige E-Mail</K>.
              </li>
            </ul>
          </li>
          <li>
            <strong>Eine E-Mail bei neuen Aufgaben.</strong> Ordnet dir jemand eine Aufgabe zu, bekommst du wenige Minuten später eine
            E-Mail. Ordnet dir jemand mehrere Aufgaben kurz hintereinander zu, kommen sie gesammelt in einer E-Mail. Trägst du dich selbst
            ein, kommt keine E-Mail.
          </li>
        </ol>
        <p>
          In den E-Mails stehen die Aufgaben, für die du verantwortlich bist. Dazu kommen Aufgaben, die du selbst angelegt hast und die
          noch niemandem zugeordnet sind. Erledigte Aufgaben fehlen. Ein Klick auf eine Aufgabe in der E-Mail öffnet ihr Projekt.
        </p>
        <p>Die E-Mails gehen an die Adresse, mit der du dich anmeldest. Sie steht links unten in der Seitenleiste.</p>
        <Tip>Damit die Erinnerung vor einem Termin funktioniert, braucht die Aufgabe ein Datum im Feld Fällig am.</Tip>
      </Section>

      <Section id="kalender" title="Termine im Kalender">
        <p>
          Deine Aufgaben mit Datum und die Meilensteine deiner Projekte kannst du in deinem gewohnten Kalender sehen – in Outlook, Google Kalender oder am Handy.
        </p>
        <ul>
          <li>
            Geh links auf <K>E-Mail &amp; Kalender</K> und scroll zu <strong>Termine im Kalender</strong>.
          </li>
          <li>
            Klick auf <K>Kalender-Link erstellen</K>.
          </li>
          <li>
            Klick auf <K>In Outlook oder Apple Kalender öffnen</K> bzw. <K>In Google Kalender hinzufügen</K>. Oder kopier den Link und füg ihn in deinem
            Kalender bei „Kalender aus dem Internet abonnieren“ ein.
          </li>
        </ul>
        <p>
          Der Kalender zeigt Aufgaben, für die du verantwortlich bist, und Aufgaben, die du angelegt und niemandem zugeteilt hast. Hat eine Aufgabe einen
          Beginn, geht der Termin über mehrere Tage. Erledigte Aufgaben bekommen ein Häkchen ✓, Meilensteine eine Raute ◆.
        </p>
        <Tip>
          Ändern kannst du die Termine nur in Projektraum. Dein Kalender holt sich die Änderungen von selbst, das dauert aber je nach Kalender bis zu ein paar
          Stunden. Den Link gibst du nicht weiter. Hast du ihn doch geteilt, klick auf <K>Link erneuern</K>.
        </Tip>
      </Section>

      <Section id="darstellung" title="Aussehen anpassen">
        <p>
          Du kannst Projektraum so einstellen, wie es dir gefällt. Die Einstellungen gelten nur für dich. Andere im Team sehen weiter ihre
          eigene Darstellung.
        </p>
        <p>
          <strong>Schnell umschalten.</strong> Links in der Seitenleiste wählst du <K>Hell</K>, <K>Dunkel</K> oder <K>Automatisch</K>.
          Automatisch richtet sich danach, was in Windows eingestellt ist.
        </p>
        <p>
          <strong>Alles selbst gestalten.</strong> Öffne links <K>Darstellung</K>. Dort geht es so:
        </p>
        <ol>
          <li>
            Wähle oben einen Stil als Ausgangspunkt, zum Beispiel <K>Modern</K>, <K>Jung</K> oder <K>Oldschool</K>.
          </li>
          <li>Ändere einzelne Farben. Ein Klick auf ein Farbfeld öffnet die Farbauswahl.</li>
          <li>Stell Ecken, Rahmen, Schrift und Abstände ein. Mit Kompakt passen mehr Aufgaben auf den Bildschirm.</li>
          <li>
            Lade ein eigenes Foto als Hintergrund hoch, wenn du magst. Mit <K>Bild abschwächen</K> wird es blasser, damit die Schrift
            gut lesbar bleibt.
          </li>
          <li>
            Klick auf <K>Speichern</K>.
          </li>
        </ol>
        <p>
          Jede Änderung siehst du sofort in der ganzen App, aber erst mit Speichern bleibt sie. Gehst du ohne Speichern weg, kommt die alte
          Darstellung zurück. Wird eine Farbkombination schwer lesbar, zeigt dir Projektraum das unter <strong>So sehen Aufgaben aus</strong>.
        </p>
        <Tip>
          Mit <K>Standard</K> kommst du jederzeit zur ursprünglichen Darstellung zurück. Klick danach auf Speichern.
        </Tip>
      </Section>

      <Section id="ki" title="Aufgaben mit KI anlegen">
        <p>
          Du kannst Projektraum mit <strong>Claude</strong> verbinden, einem KI-Assistenten. Dann musst du Aufgaben nicht mehr einzeln eintippen. Du
          schreibst Claude einfach, was zu tun ist, und Claude trägt es für dich ein.
        </p>
        <p>
          <strong>Einmal einrichten:</strong> Klick links auf{" "}
          <Link href="/ki" className="font-semibold text-(--c-accent) underline underline-offset-4">
            KI-Assistent
          </Link>
          . Dort steht Schritt für Schritt, was du in Claude eintragen musst. Das dauert etwa zwei Minuten. Jede Person verbindet ihr eigenes Konto.
        </p>
        <p>Danach kannst du Claude zum Beispiel schreiben:</p>
        <ul>
          <li>„Leg im Projekt Firmengründung eine Aufgabe an: Termin beim Notar ausmachen, bis Freitag, für mich.“</li>
          <li>„Hier ist das Protokoll unserer Besprechung. Mach daraus Aufgaben und teil sie den richtigen Leuten zu.“</li>
          <li>„Was ist bei mir diese Woche fällig?“</li>
          <li>„Hak die Aufgabe ‚Angebot schicken‘ ab und schreib als Kommentar dazu, dass es am Montag rausging.“</li>
        </ul>
        <p>
          Claude sieht nur, was du auch siehst, und alles erscheint unter deinem Namen. <strong>Löschen kann Claude nichts</strong> – das machst du
          immer selbst in der App. Unter <K>KI-Assistent</K> kannst du die Verbindung jederzeit wieder trennen.
        </p>
        <Tip>
          Sag Claude dazu, in welches Projekt die Aufgaben gehören. Ist es nicht eindeutig, fragt Claude nach. Schau beim ersten Mal kurz nach, ob alles
          so angelegt wurde, wie du es wolltest.
        </Tip>
      </Section>

      <Section id="papierkorb" title="Gelöscht? Der Papierkorb">
        <p>
          Wenn du eine Aufgabe oder ein Projekt löschst, ist es nicht sofort weg. Es kommt zuerst in den <K>Papierkorb</K> (links in der Seitenleiste)
          und bleibt dort 30 Tage.
        </p>
        <ul>
          <li>
            Mit <K>Wiederherstellen</K> holst du es zurück, mit allen Unteraufgaben, Kommentaren, Dateien und Verantwortlichen.
          </li>
          <li>
            Mit <K>Endgültig löschen</K> ist es sofort weg. Hängen Dateien daran, kannst du sie vorher noch speichern.
          </li>
          <li>Nach 30 Tagen löscht Projektraum alles im Papierkorb automatisch endgültig.</li>
        </ul>
        <Tip>
          Ein gelöschtes Projekt kann nur wiederherstellen, wer es angelegt hat, oder wer in der Firma Admin ist. Gelöschte Aufgaben kann jede Person
          aus dem Projekt zurückholen.
        </Tip>
      </Section>

      <Section id="installieren" title="Projektraum auf dem PC installieren">
        <p>Du kannst Projektraum wie ein normales Programm auf deinem Windows-PC einrichten. Dann hat es ein eigenes Fenster und ein Symbol in der Taskleiste.</p>
        <ol>
          <li>Öffne Projektraum in Microsoft Edge oder Google Chrome.</li>
          <li>Rechts in der Adresszeile erscheint ein kleines Symbol mit einem Bildschirm und Pfeil. Klicke darauf.</li>
          <li>
            Klicke auf <K>Installieren</K>.
          </li>
        </ol>
        <p>
          Findest du das Symbol nicht, öffne das Menü mit den drei Punkten oben rechts im Browser. In Edge heißt der Eintrag Apps und dann
          Diese Website als App installieren. In Chrome heißt er Streamen, speichern und teilen und dann Seite als App installieren.
        </p>
      </Section>

      <Section id="fragen" title="Häufige Fragen">
        <dl className="flex flex-col gap-4">
          {[
            ["Wer sieht meine privaten Projekte?", "Nur du. Der Bereich Privat gehört dir allein."],
            [
              "Ich habe eine Aufgabe aus Versehen abgehakt.",
              "Klicke noch einmal auf den grünen Kreis. Dann ist sie wieder offen.",
            ],
            [
              "Was passiert, wenn ich eine Rubrik lösche?",
              "Nur die Spalte verschwindet. Die Projekte oder Aufgaben darin bleiben erhalten und stehen danach unter Ohne Rubrik.",
            ],
            [
              "Was passiert, wenn ich eine Aufgabe lösche?",
              "Die Aufgabe und ihre Unteraufgaben sind endgültig weg. Deshalb fragt Projektraum vorher nach. Wenn du sie nur nicht mehr sehen willst, hake sie lieber ab.",
            ],
            [
              "Ich bekomme zu viele oder keine E-Mails.",
              "Öffne links in der Seitenleiste Benachrichtigungen und stell dort ein, was du möchtest. Kommt gar nichts an, schau auch im Spam-Ordner nach.",
            ],
            [
              "Kann ich Projektraum dunkel einstellen?",
              "Ja. Links in der Seitenleiste wählst du zwischen Hell, Dunkel und Automatisch. Automatisch richtet sich danach, was in Windows eingestellt ist. Diese Wahl gilt für das Gerät, auf dem du sie triffst. Ein eigenes Design unter Darstellung gilt dagegen auf allen deinen Geräten.",
            ],
            [
              "Muss ich etwas speichern?",
              "Nein. Jede Änderung speichert Projektraum sofort.",
            ],
            [
              "Kann ich Projektraum auch am Handy nutzen?",
              "Ja. Öffne dieselbe Adresse im Browser deines Handys und melde dich an. Das Verschieben durch Ziehen funktioniert aber nur am PC mit der Maus. Am Handy änderst du Status und Rubrik in den Details der Aufgabe.",
            ],
          ].map(([q, a]) => (
            <div key={q}>
              <dt className="font-bold">{q}</dt>
              <dd className="text-(--c-text-2)">{a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <p className="text-sm text-(--c-muted) pb-4">
        <Link href="/" className="font-semibold text-(--c-accent) hover:underline underline-offset-4">
          Zurück zur Übersicht
        </Link>
      </p>
    </div>
  );
}
