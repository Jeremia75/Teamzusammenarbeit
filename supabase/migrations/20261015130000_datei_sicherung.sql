-- =====================================================================
-- Sicherung der Dateien (Anhänge)
--
-- Der Versand-Dienst "benachrichtigungen" kopiert alle paar Minuten neue
-- Dateien aus "anhaenge" in den privaten Speicher "sicherungen" (Ordner
-- anhaenge/). Ist das Original weg (gelöscht, Papierkorb geleert), bleibt
-- die Kopie noch 30 Tage, dann wird sie entfernt.
-- Hier wird nur Buch geführt; das Kopieren macht der Dienst.
-- =====================================================================

create table public.file_backups (
  path         text primary key,          -- Pfad im Speicher "anhaenge"
  size         bigint not null default 0,
  backed_up_at timestamptz not null default now(),
  gone_at      timestamptz,                -- Original nicht mehr da
  removed_at   timestamptz                 -- Kopie entfernt
);
alter table public.file_backups enable row level security;
-- Keine Regeln: nur das Dienstkonto (über die Funktionen unten)

-- Was ist zu tun? Neue Dateien zum Kopieren, abgelaufene Kopien zum Entfernen.
create or replace function public.file_backup_todo(max_files int default 25, max_bytes bigint default 100000000)
returns jsonb language plpgsql security definer set search_path = public, storage as $$
declare
  copy_list jsonb;
  remove_list jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;

  -- Originale, die verschwunden sind, vormerken (und wieder aufgetauchte zurücksetzen)
  update file_backups b set gone_at = now()
  where b.gone_at is null and b.removed_at is null
    and not exists (select 1 from storage.objects o where o.bucket_id = 'anhaenge' and o.name = b.path);
  update file_backups b set gone_at = null
  where b.gone_at is not null and b.removed_at is null
    and exists (select 1 from storage.objects o where o.bucket_id = 'anhaenge' and o.name = b.path);

  -- Neue (oder geänderte) Dateien, höchstens max_files Stück bzw. max_bytes
  select coalesce(jsonb_agg(jsonb_build_object('path', x.name, 'size', x.size) order by x.created_at), '[]'::jsonb) into copy_list
  from (
    select o.name, o.created_at, coalesce((o.metadata ->> 'size')::bigint, 0) as size,
           sum(coalesce((o.metadata ->> 'size')::bigint, 0)) over (order by o.created_at, o.name) as running
    from storage.objects o
    left join file_backups b on b.path = o.name
    where o.bucket_id = 'anhaenge'
      and (b.path is null or b.removed_at is not null or o.updated_at > b.backed_up_at)
    order by o.created_at, o.name
    limit max_files
  ) x
  where x.running <= max_bytes or x.running = x.size;  -- eine einzelne große Datei geht immer

  select coalesce(jsonb_agg(path), '[]'::jsonb) into remove_list
  from (select path from file_backups where removed_at is null and gone_at < now() - interval '30 days' limit 100) r;

  return jsonb_build_object('copy', copy_list, 'remove', remove_list);
end $$;

-- Erledigtes eintragen
create or replace function public.file_backup_done(copied jsonb default '[]', removed text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  insert into file_backups (path, size, backed_up_at)
  select e ->> 'path', coalesce((e ->> 'size')::bigint, 0), now() from jsonb_array_elements(copied) e
  on conflict (path) do update set size = excluded.size, backed_up_at = now(), gone_at = null, removed_at = null;
  update file_backups set removed_at = now() where path = any(removed);
end $$;

-- Übersicht für die Fehler-/Sicherungs-Mail und zum Nachsehen
create or replace function public.file_backup_status()
returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then return null; end if;
  return jsonb_build_object(
    'gesichert', (select count(*) from file_backups where removed_at is null and gone_at is null),
    'offen', (select count(*) from storage.objects o where o.bucket_id = 'anhaenge'
              and not exists (select 1 from file_backups b where b.path = o.name and b.removed_at is null)),
    'nur_noch_kopie', (select count(*) from file_backups where removed_at is null and gone_at is not null)
  );
end $$;
