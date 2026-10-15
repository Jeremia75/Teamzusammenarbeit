# Projektraum – Arbeitshinweise

- Sprache in App, Hilfe und Commits: Deutsch, Nutzer per Du, einfache Sprache.
- **Commits:** auch mittelgroße Zwischenschritte committen und nach GitHub pushen (Wunsch von Werner), nicht erst das fertige Feature.
- Deploy: Vercel-Projekt `prj_geuzDienfDcBVPxAD3KBDYF9yaDw` aus GitHub `Jeremia75/Teamzusammenarbeit` (main).
- Supabase-Projekt: `kgojfedgrfezexammwpm`. Migrationen liegen in `supabase/migrations/` und werden live per `apply_migration` eingespielt.
- Lokale Tests: Postgres auf Port 5499, `/home/claude/e2e/reset.sh` baut alles neu, Playwright-Tests `test*.mjs` dort.
- KI-Konnektor: MCP-Server unter `/api/mcp` (`src/lib/mcp/`), Anmeldung über den OAuth-2.1-Server von Supabase Auth, Freigabeseite `/oauth/consent`. Über den Konnektor wird nie etwas gelöscht.
- **Migrationen live:** `apply_migration` bricht ab, sobald das SQL `delete`, `drop` oder `revoke` enthält (die Freigabe kommt nicht an). Darum: alles Hinzufügende per `apply_migration`, den Rest in eine Datei `supabase/manuell_*.sql` schreiben und Werner zum Einfügen im Supabase SQL Editor geben.
- Vercel: Nach einem Rollback werden neue Deployments nicht automatisch live – mit `request_promote` freischalten.
