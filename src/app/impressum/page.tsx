import { LegalPage, H2, V } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Impressum · Projektraum" };

export default function ImpressumPage() {
  const L = LEGAL;
  return (
    <LegalPage title="Impressum">
      <p>Angaben nach § 5 E-Commerce-Gesetz und Offenlegung nach § 25 Mediengesetz.</p>

      <H2>Medieninhaber und Betreiber</H2>
      <p>
        <V v={L.betreiber} />
        <br />
        <V v={L.strasse} />
        <br />
        <V v={L.ort} />, {L.land}
      </p>
      <p>
        E-Mail: <V v={L.email} />
        {L.telefon && (
          <>
            <br />
            Telefon: {L.telefon}
          </>
        )}
      </p>
      {L.firmenbuch && (
        <p>
          Firmenbuchnummer: {L.firmenbuch}
          {L.firmenbuchgericht && <>, {L.firmenbuchgericht}</>}
          {L.uid && (
            <>
              <br />
              UID-Nummer: {L.uid}
            </>
          )}
        </p>
      )}

      <H2>Unternehmensgegenstand</H2>
      <p>{L.gegenstand}.</p>

      <H2>Grundlegende Richtung</H2>
      <p>Projektraum ist ein Werkzeug zur Zusammenarbeit. Die Inhalte in der App stammen von den jeweiligen Nutzerinnen und Nutzern.</p>

      <H2>Haftung</H2>
      <p>
        Für Inhalte, die Nutzerinnen und Nutzer in Projektraum anlegen, sind diese selbst verantwortlich. Für Inhalte externer Links übernehmen wir keine
        Haftung; dafür sind die Betreiber der verlinkten Seiten verantwortlich.
      </p>

      <H2>Streitbeilegung</H2>
      <p>Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
    </LegalPage>
  );
}
