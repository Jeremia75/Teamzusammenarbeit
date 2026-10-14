-- Dateien und Links an Aufgaben.

create table public.task_attachments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  kind          text not null check (kind in ('file', 'link')),
  name          text not null check (char_length(name) between 1 and 200),
  -- Link: Adresse; Datei: null
  url           text check (url is null or (url ~* '^https?://' and char_length(url) <= 2000)),
  -- Datei: Pfad im Speicher "anhaenge", immer "<task-id>/<zufall>-<name>"
  storage_path  text check (storage_path is null or storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$'),
  mime          text check (mime is null or char_length(mime) <= 150),
  size          bigint check (size is null or size between 0 and 26214400),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((kind = 'link' and url is not null and storage_path is null)
      or (kind = 'file' and storage_path is not null and url is null))
);
create index on public.task_attachments (task_id);

alter table public.task_attachments enable row level security;

create policy task_attachments_select on public.task_attachments for select
  using (private.can_access_task(task_id));
create policy task_attachments_insert on public.task_attachments for insert
  with check (private.can_access_task(task_id)
              and (storage_path is null or split_part(storage_path, '/', 1) = task_id::text));
create policy task_attachments_update on public.task_attachments for update
  using (private.can_access_task(task_id)) with check (private.can_access_task(task_id));
create policy task_attachments_delete on public.task_attachments for delete
  using (private.can_access_task(task_id));

-- Nur der Name darf nachträglich geändert werden
create or replace function private.attachments_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.task_id <> old.task_id or new.kind <> old.kind or new.storage_path is distinct from old.storage_path then
    raise exception 'Anhang kann nicht verschoben werden';
  end if;
  return new;
end $$;
create trigger task_attachments_before_update before update on public.task_attachments
  for each row execute function private.attachments_before_update();

-- Wiederkehrende Aufgaben: Links in die nächste Aufgabe mitnehmen (Dateien nicht)
create or replace function public.tasks_spawn_recurrence()
returns trigger language plpgsql set search_path = public as $$
declare
  next_id  uuid := gen_random_uuid();
  next_due date;
begin
  if new.recurrence is null or new.recurrence_spawned
     or new.status <> 'done' or old.status = 'done' then
    return new;
  end if;

  next_due := private.next_occurrence(coalesce(old.due_date, current_date), new.recurrence);
  if next_due < current_date then
    next_due := private.next_occurrence(current_date, new.recurrence);
  end if;

  new.recurrence_spawned := true;

  insert into tasks (id, project_id, parent_id, milestone_id, section_id, title, description,
                     status, priority, due_date, position, recurrence, created_by)
  values (next_id, new.project_id, new.parent_id, new.milestone_id, new.section_id, new.title, new.description,
          'todo', new.priority, next_due, new.position + 0.001, new.recurrence, new.created_by);

  insert into task_assignees (task_id, user_id)
  select next_id, user_id from task_assignees where task_id = new.id;

  insert into tasks (project_id, parent_id, title, description, status, priority, position, created_by)
  select project_id, next_id, title, description, 'todo', priority, position, created_by
  from tasks where parent_id = new.id;

  insert into task_attachments (task_id, kind, name, url, created_by, created_at)
  select next_id, 'link', name, url, created_by, created_at
  from task_attachments where task_id = new.id and kind = 'link';

  return new;
end $$;

-- Echtzeit: neue Anhänge sofort bei allen sichtbar
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.task_attachments;
  end if;
end $$;

-- Speicher für Dateien (nur auf Supabase; lokal ohne Storage übersprungen)
do $outer$
begin
  if not exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    raise notice 'Speicher übersprungen: kein Storage vorhanden';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('anhaenge', 'anhaenge', false, 26214400)
  on conflict (id) do nothing;

  -- Zugriff hat, wer die Aufgabe sehen darf (erster Ordner = Aufgaben-ID)
  execute $p$
    create policy anhaenge_select on storage.objects for select to authenticated
      using (bucket_id = 'anhaenge' and private.can_access_task(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy anhaenge_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'anhaenge' and private.can_access_task(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy anhaenge_delete on storage.objects for delete to authenticated
      using (bucket_id = 'anhaenge' and private.can_access_task(((storage.foldername(name))[1])::uuid))
  $p$;
end
$outer$;
