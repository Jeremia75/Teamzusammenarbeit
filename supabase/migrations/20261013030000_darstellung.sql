-- Eigene Darstellung je Person: Farben, Form, Schrift und Hintergrundbild.

create table public.appearance_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- null = Standard (Hell / Dunkel / Automatisch über den Umschalter)
  settings    jsonb,
  -- Pfad im Speicher "hintergruende", z. B. "<user-id>/<zufall>.jpg"
  image_path  text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'),
  updated_at  timestamptz not null default now()
);

alter table public.appearance_settings enable row level security;

create policy appearance_select on public.appearance_settings for select using (user_id = auth.uid());
create policy appearance_insert on public.appearance_settings for insert with check (user_id = auth.uid());
create policy appearance_update on public.appearance_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy appearance_delete on public.appearance_settings for delete using (user_id = auth.uid());

-- Bild muss im eigenen Ordner liegen
create or replace function private.appearance_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.image_path is not null and split_part(new.image_path, '/', 1) <> new.user_id::text then
    raise exception 'Bild gehört nicht zu diesem Konto';
  end if;
  return new;
end $$;

create trigger appearance_before_write before insert or update on public.appearance_settings
  for each row execute function private.appearance_before_write();

-- Speicher für Hintergrundbilder (nur auf Supabase; lokal ohne Storage übersprungen)
do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage')
     or not exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    raise notice 'Speicher übersprungen: kein Storage vorhanden';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('hintergruende', 'hintergruende', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  -- Jede Person sieht und ändert nur den eigenen Ordner
  execute $p$
    create policy hintergruende_select on storage.objects for select to authenticated
      using (bucket_id = 'hintergruende' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy hintergruende_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'hintergruende' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy hintergruende_update on storage.objects for update to authenticated
      using (bucket_id = 'hintergruende' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'hintergruende' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy hintergruende_delete on storage.objects for delete to authenticated
      using (bucket_id = 'hintergruende' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
end
$outer$;
