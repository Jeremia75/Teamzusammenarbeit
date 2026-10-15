-- Benachrichtigungen in der App (Glocke), @Erwähnungen in Kommentaren und Kalender-Abo.

-- ---------------------------------------------------------------------
-- Zugriffsprüfung für eine bestimmte Person (nicht nur für die angemeldete)
-- ---------------------------------------------------------------------
create or replace function private.user_can_access_task(uid uuid, t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks tk
    join projects p on p.id = tk.project_id
    join workspaces w on w.id = p.workspace_id
    where tk.id = t and (
      exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = uid)
      or exists (select 1 from organization_members om where om.organization_id = w.organization_id and om.user_id = uid and om.role in ('owner', 'admin'))
    )
  );
$$;
revoke all on function private.user_can_access_task(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Erwähnte Personen eines Kommentars
-- ---------------------------------------------------------------------
alter table public.comments add column mentions uuid[] not null default '{}';
alter table public.comments add constraint comments_mentions_max check (cardinality(mentions) <= 20);

-- ---------------------------------------------------------------------
-- Benachrichtigungen (nur die Datenbank legt sie an)
-- ---------------------------------------------------------------------
create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('assigned', 'mention', 'comment', 'done')),
  task_id     uuid references public.tasks (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  body        text check (body is null or char_length(body) <= 300),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());
revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function private.notify(uid uuid, k text, t uuid, actor uuid, txt text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if uid is null or uid is not distinct from actor then return; end if;
  if not private.user_can_access_task(uid, t) then return; end if;
  insert into notifications (user_id, kind, task_id, actor_id, body)
  values (uid, k, t, actor, case when txt is null then null else left(txt, 280) end);
end $$;
revoke all on function private.notify(uuid, text, uuid, uuid, text) from public, anon, authenticated;

-- Zugeteilt
create or replace function private.notify_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Nicht bei der automatisch angelegten nächsten Runde einer wiederkehrenden Aufgabe
  if exists (select 1 from tasks t where t.id = new.task_id and t.recurrence is not null and t.created_at = now()) then
    return new;
  end if;
  perform private.notify(new.user_id, 'assigned', new.task_id, auth.uid(), null);
  return new;
end $$;
create trigger task_assignees_notify after insert on public.task_assignees
  for each row execute function private.notify_assigned();

-- Kommentar: Erwähnte bekommen "mention", Verantwortliche und Ersteller "comment"
create or replace function private.notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  u uuid;
  mentioned uuid[] := coalesce(new.mentions, '{}');
begin
  for u in select distinct x from unnest(mentioned) x loop
    perform private.notify(u, 'mention', new.task_id, new.author_id, new.body);
  end loop;
  for u in
    select a.user_id from task_assignees a where a.task_id = new.task_id
    union
    select t.created_by from tasks t where t.id = new.task_id and t.created_by is not null
  loop
    if not (u = any (mentioned)) then
      perform private.notify(u, 'comment', new.task_id, new.author_id, new.body);
    end if;
  end loop;
  return new;
end $$;
create trigger comments_notify after insert on public.comments
  for each row execute function private.notify_comment();

-- Erledigt: Ersteller und Verantwortliche erfahren es (nur Hauptaufgaben)
create or replace function private.notify_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if new.status = 'done' and old.status <> 'done' and new.parent_id is null then
    for u in
      select a.user_id from task_assignees a where a.task_id = new.id
      union
      select new.created_by where new.created_by is not null
    loop
      perform private.notify(u, 'done', new.id, auth.uid(), null);
    end loop;
  end if;
  return new;
end $$;
create trigger tasks_notify_done after update of status on public.tasks
  for each row execute function private.notify_done();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Kalender-Abo: geheimer Link je Person
-- ---------------------------------------------------------------------
create table public.calendar_tokens (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token      text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.calendar_tokens enable row level security;
create policy calendar_tokens_select on public.calendar_tokens for select using (user_id = auth.uid());
create policy calendar_tokens_insert on public.calendar_tokens for insert with check (user_id = auth.uid());
create policy calendar_tokens_delete on public.calendar_tokens for delete using (user_id = auth.uid());
revoke update on public.calendar_tokens from anon, authenticated;

-- Liefert die Termine für einen Kalender-Link: eigene Aufgaben und Meilensteine der eigenen Projekte.
-- Aufrufbar ohne Anmeldung (Kalender-Apps können sich nicht anmelden) – der lange Zufallsschlüssel ist der Zugang.
create or replace function public.calendar_feed(tok text)
returns table (kind text, id uuid, title text, start_date date, end_date date, project text, project_id uuid, status text, description text)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid;
begin
  if tok is null or char_length(tok) < 40 then return; end if;
  select c.user_id into uid from calendar_tokens c where c.token = tok;
  if uid is null then return; end if;

  return query
  select 'task'::text, t.id, t.title, coalesce(t.start_date, t.due_date), coalesce(t.due_date, t.start_date),
         p.name, p.id, t.status::text, left(t.description, 1000)
  from tasks t
  join projects p on p.id = t.project_id and p.archived_at is null
  where (t.due_date is not null or t.start_date is not null)
    and coalesce(t.due_date, t.start_date) >= current_date - 60
    and (exists (select 1 from task_assignees a where a.task_id = t.id and a.user_id = uid)
         or (t.created_by = uid and not exists (select 1 from task_assignees a where a.task_id = t.id)))
    and private.user_can_access_task(uid, t.id)
  union all
  select 'milestone'::text, m.id, m.name, m.due_date, m.due_date, p.name, p.id, null::text, null::text
  from milestones m
  join projects p on p.id = m.project_id and p.archived_at is null
  join workspaces w on w.id = p.workspace_id
  where m.due_date is not null and m.due_date >= current_date - 60
    and (exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = uid)
         or exists (select 1 from organization_members om where om.organization_id = w.organization_id and om.user_id = uid and om.role in ('owner', 'admin')))
  limit 2000;
end $$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
