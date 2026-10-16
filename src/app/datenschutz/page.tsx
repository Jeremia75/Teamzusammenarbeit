import Link from "next/link";
import { LegalPage, H2, V } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Datenschutzerklärung · Projektraum" };

const DIENSTE: [string, string, string][] = [
  ["Supabase Inc.", "Datenbank, Anmeldung, Dateispeicher, Hintergrund-Dienste", "Server in Frankfurt (EU); Unternehmen mit Sitz in den USA"],
  ["Vercel Inc.", "Bereitstellung der Web-App (Hosting)", "USA, Server-Funktionen in Frankfurt; zertifiziert nach dem EU-US Data Privacy Framework"],
  ["Resend Inc.", "Versand der E-Mails (Benachrichtigungen, Einladungen, Erinnerungen) und Empfang von Protokoll-Mails", "USA; zertifiziert nach dem EU-US Data Privacy Framework"],
  ["Anthropic PBC", "KI-Auswertung von Protokollen, die du hochlädst oder per Mail schickst (Aufgaben-Vorschläge)", "USA; EU-Standardvertragsklauseln"],
  ["Deepgram Inc.", "Abschreiben von Sprachaufnahmen, die du als Protokoll hochlädst", "USA; EU-Standardvertragsklauseln"],
];

export default function DatenschutzPage() {
  const L = LEGAL;
  return (
    <LegalPage title="Datenschutzerklärung">
      <p>
        Hier steht in einfachen Worten, welche Daten Projektraum verarbeitet, wozu und welche Rechte du hast. Stand: {L.stand}.
      </p>

      <H2>Wer ist verantwortlich?</H2>
      <p>
        <V v={L.betreiber} />, <V v={L.strasse} />, <V v={L.ort} />, {L.land}. E-Mail: <V v={L.email} />. Weitere Angaben im{" "}
        <Link href="/impressum" className="underline underline-offset-2">Impressum</Link>.
      </p>

      <H2>Welche Daten wir verarbeiten</H2>
      <ul className="list-disc pl-5 flex flex-col gap-1.5">
        <li>
          <strong>Konto:</strong> E-Mail-Adresse, Name, Passwort (nur verschlüsselt gespeichert), Zeitpunkt der Registrierung und der letzten Anmeldung.
        </li>
        <li>
          <strong>Was du in Projektraum anlegst:</strong> Bereiche, Projekte, Aufgaben, Kommentare, Erwähnungen, Dateien und Links, Erinnerungen sowie wer
          was wann geändert hat (Verlauf).
        </li>
        <li>
          <strong>Einstellungen:</strong> E-Mail-Benachrichtigungen, Darstellung (zum Beispiel ein eigenes Hintergrundbild), Kalender-Abo.
        </li>
        <li>
          <strong>Einladungen:</strong> Lädt dich jemand ein, speichern wir deine E-Mail-Adresse, wer dich eingeladen hat und wohin. Nimmst du die Einladung
          nicht an, kann die einladende Person sie zurückziehen.
        </li>
        <li>
          <strong>Protokolle:</strong> Texte, Dateien und Sprachaufnahmen, die du hochlädst oder an die Protokoll-Adresse schickst, damit daraus Aufgaben
          vorgeschlagen werden.
        </li>
        <li>
          <strong>Technische Daten:</strong> Bei Fehlern speichern wir die Fehlermeldung, die betroffene Seite und die Art des Browsers, damit wir den Fehler
          beheben können. Der Hosting-Anbieter verarbeitet beim Aufruf außerdem kurzzeitig die IP-Adresse.
        </li>
        <li>
          <strong>Rückmeldungen:</strong> Was du über „Feedback geben“ schickst, zusammen mit deinem Namen und der Seite, auf der du warst.
        </li>
      </ul>

      <H2>Wozu und auf welcher Grundlage</H2>
      <p>
        Wir verarbeiten die Daten, damit Projektraum funktioniert und du mit anderen zusammenarbeiten kannst. Das ist für die Nutzung notwendig
        (Art. 6 Abs. 1 lit. b DSGVO). Fehlerprotokolle, Sicherungen und Schutz vor Missbrauch beruhen auf unserem berechtigten Interesse an einem sicheren und
        funktionierenden Dienst (Art. 6 Abs. 1 lit. f DSGVO). E-Mail-Benachrichtigungen und Wochenrückblick bekommst du nur, wenn du sie einschaltest; du
        kannst sie jederzeit unter „E-Mail &amp; Kalender“ abschalten.
      </p>

      <H2>Wer die Daten sieht</H2>
      <p>
        Inhalte eines Bereichs oder Projekts sehen die Personen, die dort Mitglied oder Gast sind. Deinen privaten Bereich siehst nur du. Für den Betrieb
        nutzen wir folgende Dienste, die die Daten in unserem Auftrag verarbeiten:
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm border-collapse">
          <thead>
            <tr className="text-left text-(--c-ink)">
              <th className="py-2 pr-3 font-bold">Dienst</th>
              <th className="py-2 pr-3 font-bold">Wofür</th>
              <th className="py-2 font-bold">Ort und Absicherung</th>
            </tr>
          </thead>
          <tbody>
            {DIENSTE.map(([name, wofuer, ort]) => (
              <tr key={name} className="border-t border-(--c-line-soft) align-top">
                <td className="py-2 pr-3 font-semibold text-(--c-ink) whitespace-nowrap">{name}</td>
                <td className="py-2 pr-3">{wofuer}</td>
                <td className="py-2">{ort}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Verbindest du Projektraum selbst mit einem KI-Assistenten (zum Beispiel Claude), liest dieser in deinem Auftrag mit deinen Rechten. Dafür gelten
        zusätzlich die Bedingungen des jeweiligen Anbieters. Wir verkaufen keine Daten und nutzen sie nicht für Werbung.
      </p>

      <H2>Wie lange wir Daten speichern</H2>
      <ul className="list-disc pl-5 flex flex-col gap-1.5">
        <li>Solange dein Konto besteht. Gelöschte Aufgaben und Projekte liegen 30 Tage im Papierkorb und werden dann endgültig entfernt.</li>
        <li>Sicherungen der Datenbank und Kopien von Dateien heben wir 30 Tage auf.</li>
        <li>Fehlerprotokolle löschen wir, sobald der Fehler behoben ist, spätestens nach 90 Tagen.</li>
        <li>Nicht angenommene Einladungen nach spätestens 90 Tagen.</li>
      </ul>

      <H2>Cookies</H2>
      <p>
        Projektraum setzt nur technisch notwendige Cookies, damit du angemeldet bleibst. Einstellungen wie die gewählte Ansicht merkt sich dein Browser
        lokal. Es gibt keine Werbe- oder Analyse-Cookies; deshalb fragen wir nicht nach einer Zustimmung.
      </p>

      <H2>Deine Rechte</H2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Schreib uns dazu einfach
        an <V v={L.email} />. Möchtest du dein Konto löschen, genügt ebenfalls eine kurze Nachricht.
      </p>
      <p>
        Wenn du meinst, dass wir deine Daten nicht richtig verarbeiten, kannst du dich bei der Österreichischen Datenschutzbehörde beschweren: Barichgasse
        40–42, 1030 Wien,{" "}
        <a href="https://www.dsb.gv.at" className="underline underline-offset-2" target="_blank" rel="noreferrer">
          www.dsb.gv.at
        </a>
        .
      </p>

      <H2>Sicherheit</H2>
      <p>
        Alle Verbindungen sind verschlüsselt (HTTPS). Zugriffsrechte werden direkt in der Datenbank geprüft, sodass jede Person nur sieht, was für sie
        freigegeben ist.
      </p>
    </LegalPage>
  );
}
