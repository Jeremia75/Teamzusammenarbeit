-- =====================================================================
-- Aufgaben aus Protokollen
--
-- Ein Protokoll (eingefügter Text, hochgeladene Datei oder E-Mail) wird von
-- der Edge Function "protokoll" gelesen: Ton und Video werden abgeschrieben,
-- dann schlägt eine KI Aufgaben vor. Angelegt wird erst, wenn die Person die
-- Vorschläge geprüft hat.
-- =====================================================================

create table public.protocol_imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  source        text not null check (source in ('text', 'file', 'mail')),
  title         text not null default '',
  status        text not null default 'processing' check (status in ('processing', 'ready', 'done', 'failed', 'dismissed')),
  error         text,
  summary       text,
  transcript    text,
  suggestions   jsonb not null default '[]'::jsonb,
  created_count int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.protocol_imports (user_id, created_at desc);
create trigger protocol_imports_updated_at before update on public.protocol_imports
  for each row execute function public.set_updated_at();

alter table public.protocol_imports enable row level security;
create policy protocol_imports_select on public.protocol_imports for select to authenticated
  using (user_id = auth.uid());
create policy protocol_imports_update on public.protocol_imports for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Anlegen nur über die Edge Function (Dienstkonto)

-- Was die Person selbst ändern darf: Projekt, Vorschläge (bearbeitet), Status, Anzahl
create or replace function private.protocol_imports_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.user_id <> old.user_id or new.source <> old.source or new.transcript is distinct from old.transcript
       or new.created_at <> old.created_at then
      raise exception 'Diese Angaben lassen sich nicht ändern';
    end if;
    if new.status not in ('ready', 'done', 'dismissed') or old.status in ('processing') then
      raise exception 'Dieses Protokoll wird noch gelesen';
    end if;
  end if;
  return new;
end $$;
create trigger protocol_imports_guard before update on public.protocol_imports
  for each row execute function private.protocol_imports_guard();

-- Einstellungen der App (z. B. die E-Mail-Adresse für Protokolle)
create table public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
create policy app_settings_select on public.app_settings for select to authenticated using (true);

-- Speicher für hochgeladene Protokolle: erster Ordner = eigene Nutzer-ID
do $outer$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Speicher übersprungen: kein Storage vorhanden';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('protokolle', 'protokolle', false, 52428800)
  on conflict (id) do nothing;
  execute $p$
    create policy protokolle_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'protokolle' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
  execute $p$
    create policy protokolle_select on storage.objects for select to authenticated
      using (bucket_id = 'protokolle' and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
end
$outer$;

-- Für die Edge Function: Person zu einer Absender-Adresse (nur registrierte Konten)
-- (nur für das Dienstkonto – alle anderen bekommen nichts zurück)
create or replace function public.protocol_user_by_email(mail text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from auth.users
  where coalesce(auth.role(), '') = 'service_role' and lower(email) = lower(trim(mail))
  limit 1;
$$;

-- Für die Edge Function: alles, was die KI über die Projekte der Person wissen muss.
-- Nur Projekte, in denen sie bearbeiten darf. Nur für das Dienstkonto.
create or replace function public.protocol_context(uid uuid, proj uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select p.id, p.name, w.name as ws_name, p.workspace_id
    from projects p
    join workspaces w on w.id = p.workspace_id
    where coalesce(auth.role(), '') = 'service_role'
      and p.deleted_at is null and p.archived_at is null
      and (proj is null or p.id = proj)
      and (
        exists (select 1 from organization_members om where om.organization_id = w.organization_id and om.user_id = uid and om.role in ('owner', 'admin'))
        or exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = uid and wm.role = 'editor')
        or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = uid and pm.role = 'editor')
      )
  )
  select jsonb_build_object(
    'user_name', (select coalesce(nullif(display_name, ''), 'Unbenannt') from profiles where id = uid and coalesce(auth.role(), '') = 'service_role'),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'bereich', m.ws_name,
        'rubriken', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.position) from sections s where s.project_id = m.id), '[]'::jsonb),
        'meilensteine', coalesce((select jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'faellig', ms.due_date) order by ms.position) from milestones ms where ms.project_id = m.id), '[]'::jsonb),
        'mitglieder', coalesce((
          select jsonb_agg(jsonb_build_object('id', pr.id, 'name', coalesce(nullif(pr.display_name, ''), 'Unbenannt')))
          from profiles pr
          where pr.id in (select wm.user_id from workspace_members wm where wm.workspace_id = m.workspace_id
                          union select pm.user_id from project_members pm where pm.project_id = m.id)
        ), '[]'::jsonb),
        'offene_aufgaben', coalesce((
          select jsonb_agg(t.title) from (
            select title from tasks where project_id = m.id and parent_id is null and deleted_at is null and status <> 'done'
            order by position limit 60
          ) t
        ), '[]'::jsonb)
      ) order by m.name)
      from mine m
    ), '[]'::jsonb)
  );
$$;
