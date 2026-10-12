# Projektraum

Projekt- und Aufgabenverwaltung für Teams, ähnlich wie Asana oder Trello.
Zuerst für den Eigengebrauch gedacht. Die Struktur ist aber schon so angelegt, dass die App später an andere Firmen verkauft werden kann.

## Aufbau

```
Organisation (Mandant – eure Firma, später jeder zahlende Kunde)
 └─ Bereich (z. B. "Beruflich"; jeder Nutzer hat automatisch "Privat")
     └─ Projekt
         ├─ Ziele & Meilensteine
         └─ Aufgaben
             └─ Unteraufgaben (beliebig tief)
```

- **Privat und beruflich getrennt:** Bei der Registrierung bekommt jeder Nutzer eine eigene private Organisation mit dem Bereich „Privat“. Diesen Bereich sieht niemand sonst. Die Firma ist eine eigene Organisation mit eigenen Bereichen und Mitgliedern.
- **Zugriffsschutz in der Datenbank:** Jede Tabelle ist mit Row Level Security abgesichert. Wer nicht Mitglied eines Bereichs ist, bekommt dessen Daten gar nicht ausgeliefert, auch nicht bei einem Fehler im Frontend.
- **Rollen:** `owner`, `admin` und `member`. Admins verwalten Bereiche und Mitglieder, alle Bereichsmitglieder dürfen an Projekten und Aufgaben mitarbeiten.

## Technik

| Teil | Werkzeug |
|---|---|
| Oberfläche | Next.js 15 (React, TypeScript, Tailwind) |
| Datenbank, Login, Echtzeit | Supabase (PostgreSQL) |
| Hosting | Vercel (empfohlen, Region Frankfurt) |
| Windows-App | Installierbar als PWA über Edge oder Chrome |

## Einrichtung

1. **Supabase-Projekt anlegen** auf [supabase.com](https://supabase.com). Als Region **Frankfurt (eu-central-1)** wählen, wegen der DSGVO.
2. Im Supabase-Dashboard unter **SQL Editor** den Inhalt von `supabase/migrations/20261012000000_grundschema.sql` einfügen und ausführen.
3. Unter **Project Settings → API** die Project-URL und den `anon`-Key kopieren.
4. Lokal: `.env.example` nach `.env.local` kopieren und die beiden Werte eintragen.
5. Starten:
   ```
   npm install
   npm run dev
   ```
   Danach http://localhost:3000 öffnen.
6. Unter **Authentication → URL Configuration** in Supabase die Adresse der App (lokal `http://localhost:3000`, später die Vercel-Adresse) als Site URL eintragen, damit der Bestätigungslink aus der Registrierungs-Mail funktioniert.

## Stand

- [x] Datenmodell mit Mandantentrennung und Zugriffsregeln (getestet)
- [x] Registrierung und Login
- [x] Übersicht der Bereiche und Projekte
- [x] Als App installierbar (PWA-Manifest)
- [ ] Board- und Listenansicht pro Projekt
- [ ] Aufgabendetails mit Unteraufgaben, Kommentaren und Zuständigen
- [ ] Meilensteine mit Fortschrittsanzeige
- [ ] Teammitglieder per E-Mail einladen
- [ ] Echtzeit-Aktualisierung im Board
