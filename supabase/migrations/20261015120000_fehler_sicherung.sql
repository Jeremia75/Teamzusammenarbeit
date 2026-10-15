-- =====================================================================
-- Fehlermeldungen und tägliche Datensicherung
--
-- Fehler aus dem Browser und vom Server landen in app_errors (gleiche
-- Fehler werden gezählt statt doppelt gespeichert). Der Versand-Dienst
-- "benachrichtigungen" schickt neue Fehler per E-Mail an die Adresse in
-- app_settings."intern.fehler_mail" und legt jede Nacht eine Sicherung aller Daten
-- im privaten Speicher "sicherungen" ab (30 Tage aufbewahrt).
-- =====================================================================

create table public.app_errors (
  id          bigint generated always as identity primary key,
  fingerprint text not null unique,
  source      text not null check (source in ('browser', 'server', 'function')),
  message     text not null,
  detail      text not null default '',
  url         text not null default '',
  user_agent  text not null default '',
  user_id     uuid references auth.users (id) on delete set null,
  count       int not null default 1,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  notified_at timestamptz
);
create index on public.app_errors (notified_at) where notified_at is null;
alter table public.app_errors enable row level security;
-- Keine Regeln: lesen und schreiben nur über report_error bzw. das Dienstkonto

-- Fehler melden (aus App und Server, auch ohne Anmeldung)
create or replace function public.report_error(src text, msg text, detail text default '', page text default '', agent text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  m   text := left(coalesce(nullif(trim(msg), ''), 'Unbekannter Fehler'), 1000);
  pth text := regexp_replace(left(coalesce(page, ''), 500), '[0-9a-f]{8}-[0-9a-f-]{27}', ':id', 'g');
  fp  text;
begin
  if src not in ('browser', 'server', 'function') then return; end if;
  -- Schutz vor Überflutung: höchstens 200 neue Fehler pro Stunde insgesamt
  if (select count(*) from app_errors where created_at > now() - interval '1 hour') > 200 then return; end if;
  fp := md5(src || '|' || m || '|' || split_part(pth, '?', 1));
  insert into app_errors (fingerprint, source, message, detail, url, user_agent, user_id)
  values (fp, src, m, left(coalesce(detail, ''), 4000), pth, left(coalesce(agent, ''), 300), auth.uid())
  on conflict (fingerprint) do update
    set count = app_errors.count + 1,
        last_seen = now(),
        -- Wieder melden, wenn der Fehler nach mehr als einem Tag erneut auftritt
        notified_at = case when app_errors.notified_at < now() - interval '1 day' then null else app_errors.notified_at end;
end $$;
grant execute on function public.report_error(text, text, text, text, text) to anon, authenticated;

-- Sicherung: alle Inhalte als ein JSON-Dokument (nur für das Dienstkonto)
create or replace function public.backup_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb := jsonb_build_object('erstellt', now(), 'version', 1);
  tbl text;
  rows jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  for tbl in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('app_errors', 'email_outbox')
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', tbl) into rows;
    out := out || jsonb_build_object(tbl, rows);
  end loop;
  -- Konten: nur, was für eine Wiederherstellung nötig ist
  out := out || jsonb_build_object('auth_users',
    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'created_at', created_at)), '[]'::jsonb) from auth.users));
  return out;
end $$;

do $outer$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Speicher übersprungen: kein Storage vorhanden';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('sicherungen', 'sicherungen', false, 524288000)
  on conflict (id) do nothing;
end
$outer$;

-- Interne Einstellungen (Schlüssel beginnt mit "intern.") sieht nur das Dienstkonto,
-- z. B. intern.fehler_mail = Empfänger der Fehlermeldungen (live gesetzt, nicht im Code)
create policy app_settings_not_intern on public.app_settings as restrictive for select to authenticated, anon
  using (key not like 'intern.%');
