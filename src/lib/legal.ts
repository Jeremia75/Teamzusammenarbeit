// Angaben für Impressum und Datenschutzerklärung – an EINER Stelle.
// Was in eckigen Klammern steht, muss Werner noch ergänzen; die Seiten zeigen es gelb markiert.
// Sobald die Firma (GmbH) betreibt: Firmenname, Firmenbuchnummer, Firmenbuchgericht, UID, Unternehmensgegenstand eintragen.

export const LEGAL = {
  /** Wer die App betreibt (Medieninhaber und Diensteanbieter) */
  betreiber: "Werner Frühwirth",
  strasse: "[Straße und Hausnummer]",
  ort: "[PLZ Ort]",
  land: "Österreich",
  email: "[E-Mail-Adresse für Anfragen]",
  telefon: "", // freiwillig
  /** Nur bei einer Firma ausfüllen, sonst leer lassen */
  firmenbuch: "",
  firmenbuchgericht: "",
  uid: "",
  gegenstand: "Betrieb der Web-App Projektraum zur gemeinsamen Planung von Aufgaben und Projekten",
  /** Stand der Datenschutzerklärung */
  stand: "16. Oktober 2026",
};

/** Noch nicht ausgefüllt? */
export const missing = (v: string) => /^\[.*\]$/.test(v.trim());
