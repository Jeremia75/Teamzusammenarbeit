-- E-Mail-Benachrichtigungen: Einstellungen je Person, Warteschlange für
-- "dir wurde eine Aufgabe zugeordnet" und Abfragen für den täglichen Versand.

-- ---------------------------------------------------------------------
-- Einstellungen (nur für die Person selbst sichtbar)
-- ---------------------------------------------------------------------
create table public.notification_settings (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  email_enabled  boolean not null default false,
  -- 'digest' = täglicher Überblick, 'due' = nur vor Fälligkeit, 'off' = nichts Regelmäßiges
  daily_mode     text not null default 'off' check (daily_mode in ('off', 'digest', 'due')),
  on_assigned    boolean not null default false,
  asked_at       timestamptz,
  last_daily_on  date,
  updated_at     timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

create policy notification_settings_select on public.notification_settings for select
  using (user_id = auth.uid());
create policy notification_settings_insert on public.notification_settings for insert
  with check (user_id = auth.uid());
create policy notification_settings_update on public.notification_settings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- last_daily_on setzt nur der Versand (über notify_mark_daily), nicht die App
create or replace function private.touch_notification_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if current_user in ('authenticated', 'anon') then
    new.last_daily_on := case when tg_op = 'UPDATE' then old.last_daily_on else null end;
  end if;
  return new;
end $$;

create trigger notification_settings_touch before insert or update on public.notification_settings
  for each row execute function private.touch_notification_settings();

-- ---------------------------------------------------------------------
-- Warteschlange: nur der Versand (service_role) liest und schreibt
-- ---------------------------------------------------------------------
create table public.email_outbox (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('assigned')),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    int not null default 0,
  last_error  text
);
create index on public.email_outbox (created_at) where sent_at is null;

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

-- Neue Zuordnung → Eintrag in die Warteschlange, wenn die Person das möchte.
-- Wer sich selbst eine Aufgabe zuordnet, bekommt keine Mail.
create or replace function private.queue_assignment_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from auth.uid() and exists (
    select 1 from notification_settings s
    where s.user_id = new.user_id and s.email_enabled and s.on_assigned
  ) then
    insert into email_outbox (user_id, kind, task_id, actor_id)
    values (new.user_id, 'assigned', new.task_id, auth.uid());
  end if;
  return new;
end $$;

create trigger task_assignees_queue_email after insert on public.task_assignees
  for each row execute function private.queue_assignment_email();

-- ---------------------------------------------------------------------
-- Abfragen für den Versand (nur service_role)
-- ---------------------------------------------------------------------

-- Offene Aufgaben einer Person: ihr zugeordnet, oder von ihr angelegt und
-- noch niemandem zugeordnet. Nur nicht archivierte Projekte.
create or replace function public.notify_open_tasks(uid uuid)
returns table (task_id uuid, title text, due_date date, status task_status, project_id uuid, project_name text)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.due_date, t.status, p.id, p.name
  from tasks t
  join projects p on p.id = t.project_id and p.archived_at is null
  where t.parent_id is null
    and t.status <> 'done'
    and (
      exists (select 1 from task_assignees a where a.task_id = t.id and a.user_id = uid)
      or (t.created_by = uid and not exists (select 1 from task_assignees a where a.task_id = t.id))
    )
  order by t.due_date nulls last, t.position;
$$;

-- Wer heute (Datum in Wien) noch seine tägliche Mail bekommt
create or replace function public.notify_daily_recipients(today date)
returns table (user_id uuid, daily_mode text, display_name text)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.daily_mode, coalesce(nullif(pr.display_name, ''), 'du')
  from notification_settings s
  left join profiles pr on pr.id = s.user_id
  where s.email_enabled and s.daily_mode <> 'off'
    and (s.last_daily_on is null or s.last_daily_on < today);
$$;

create or replace function public.notify_mark_daily(uid uuid, today date)
returns void language sql security definer set search_path = public as $$
  update notification_settings set last_daily_on = today where user_id = uid;
$$;

-- Offene Einträge der Warteschlange samt Aufgabe, Projekt und wer zugeordnet hat
create or replace function public.notify_pending_assignments()
returns table (outbox_id bigint, user_id uuid, task_id uuid, title text, due_date date,
               project_id uuid, project_name text, actor_name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.user_id, t.id, t.title, t.due_date, p.id, p.name,
         coalesce(nullif(ap.display_name, ''), 'Jemand')
  from email_outbox o
  join tasks t on t.id = o.task_id
  join projects p on p.id = t.project_id
  join notification_settings s on s.user_id = o.user_id and s.email_enabled and s.on_assigned
  left join profiles ap on ap.id = o.actor_id
  where o.sent_at is null and o.attempts < 5
    -- nur, wenn die Person noch zugeordnet ist
    and exists (select 1 from task_assignees a where a.task_id = o.task_id and a.user_id = o.user_id)
  order by o.created_at;
$$;

create or replace function public.notify_mark_outbox(ids bigint[], err text default null)
returns void language sql security definer set search_path = public as $$
  update email_outbox
  set sent_at = case when err is null then now() else sent_at end,
      attempts = attempts + 1,
      last_error = err
  where id = any (ids);
$$;

revoke all on function public.notify_open_tasks(uuid) from public, anon, authenticated;
revoke all on function public.notify_daily_recipients(date) from public, anon, authenticated;
revoke all on function public.notify_mark_daily(uuid, date) from public, anon, authenticated;
revoke all on function public.notify_pending_assignments() from public, anon, authenticated;
revoke all on function public.notify_mark_outbox(bigint[], text) from public, anon, authenticated;
grant execute on function public.notify_open_tasks(uuid) to service_role;
grant execute on function public.notify_daily_recipients(date) to service_role;
grant execute on function public.notify_mark_daily(uuid, date) to service_role;
grant execute on function public.notify_pending_assignments() to service_role;
grant execute on function public.notify_mark_outbox(bigint[], text) to service_role;
