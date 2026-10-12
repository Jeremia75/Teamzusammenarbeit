-- =====================================================================
-- Nicht angemeldete Anfragen sollen eine leere Antwort bekommen statt
-- "permission denied for function ...". Die Prüffunktionen liefern für
-- anonyme Aufrufer ohnehin immer false (auth.uid() ist leer).
-- Das Schema "private" bleibt über die REST-Schnittstelle unerreichbar.
-- =====================================================================

grant usage on schema private to anon;
grant execute on all functions in schema private to anon;
