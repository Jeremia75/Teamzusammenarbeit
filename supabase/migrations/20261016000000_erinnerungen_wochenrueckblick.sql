-- =====================================================================
-- Erinnerungen an Aufgaben und Wochenrückblick per E-Mail
--
-- Erinnerung: Jede Person kann sich bei einer Aufgabe eine eigene
-- Erinnerung (Datum + Uhrzeit) setzen. Der Dienst "benachrichtigungen"
-- schickt sie zur Zeit als E-Mail und legt einen Eintrag in der Glocke an.
--
-- Wochenrückblick: montags ab 7 Uhr (Wien) eine Mail mit dem, was letzte
-- Woche erledigt wurde, was überfällig ist und was diese Woche ansteht.
--
-- Hinweis: Die Glocke kennt die Art "reminder" erst nach
-- supabase/manuell_erinnerungen.sql (im SQL Editor einfügen). Bis dahin
-- kommen Erinnerungen nur per Mail.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Erinnerungen (eine je Person und Aufgabe)
-- Ohne Fremdschlüssel: Aufgaben wandern in den Papierkorb und kommen evtl.
-- zurück; verwaiste Einträge werden beim Versand einfach übersprungen.
-- ---------------------------------------------------------------------
create table public.task_reminders (
  id          bigint generated always as identity primary key,
  task_id     uuid not null,
  user_id     uuid not null default auth.uid(),
  remind_at   timestamptz not null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (task_id, user_id)
);
create index on public.task_reminders (remind_at) where sent_at is null;

alter table public.task_reminders enable row level security;

-- Nur eigene Erinnerungen, und nur für Aufgaben, die man sehen darf
create policy task_reminders_own on public.task_reminders for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));

-- Neue Zeit gesetzt: wieder offen
create or replace function private.touch_task_reminder()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.remind_at is distinct from old.remind_at then
    new.sent_at := null;
  end if;
  if current_user in ('authenticated', 'anon') and tg_op = 'INSERT' then
    new.sent_at := null;
  end if;
  return new;
end $$;

create trigger task_reminders_touch before insert or update on public.task_reminders
  for each row execute function private.touch_task_reminder();

-- Fällige Erinnerungen (nur für den Versand-Dienst)
create or replace function public.reminders_due()
returns table (id bigint, user_id uuid, task_id uuid, title text, due_date date, status task_status,
               project_id uuid, project_name text, remind_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  return query
    select r.id, r.user_id, t.id, t.title, t.due_date, t.status, p.id, p.name, r.remind_at
    from task_reminders r
    join tasks t on t.id = r.task_id
    join projects p on p.id = t.project_id and p.archived_at is null
    where r.sent_at is null and r.remind_at <= now()
      and private.user_can_access_task(r.user_id, t.id)
    order by r.remind_at
    limit 200;
end $$;

-- Erledigt eintragen, Glocke befüllen. Verwaiste/abgelaufene gleich mit abhaken.
create or replace function public.reminders_mark(ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  update task_reminders set sent_at = now() where id = any (ids) and sent_at is null;
  -- Erinnerungen, deren Aufgabe weg ist und die schon länger fällig sind
  update task_reminders r set sent_at = now()
  where r.sent_at is null and r.remind_at < now() - interval '1 day'
    and not exists (select 1 from tasks t where t.id = r.task_id);
  begin
    insert into notifications (user_id, kind, task_id, actor_id, body)
    select r.user_id, 'reminder', r.task_id, null, null
    from task_reminders r
    where r.id = any (ids) and exists (select 1 from tasks t where t.id = r.task_id);
  exception when check_violation then
    null; -- Glocke kennt "reminder" noch nicht (manuell_erinnerungen.sql)
  end;
end $$;

-- ---------------------------------------------------------------------
-- Wochenrückblick
-- ---------------------------------------------------------------------
alter table public.notification_settings
  add column if not exists weekly_review boolean not null default false,
  add column if not exists last_weekly_on date;

-- last_daily_on und last_weekly_on setzt nur der Versand, nicht die App
create or replace function private.touch_notification_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if current_user in ('authenticated', 'anon') then
    new.last_daily_on := case when tg_op = 'UPDATE' then old.last_daily_on else null end;
    new.last_weekly_on := case when tg_op = 'UPDATE' then old.last_weekly_on else null end;
  end if;
  return new;
end $$;

-- Wer diese Woche (ab week_start, Montag) noch keinen Rückblick bekommen hat
create or replace function public.notify_weekly_recipients(week_start date)
returns table (user_id uuid, display_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  return query
    select s.user_id, coalesce(nullif(pr.display_name, ''), 'du')
    from notification_settings s
    left join profiles pr on pr.id = s.user_id
    where s.email_enabled and s.weekly_review
      and (s.last_weekly_on is null or s.last_weekly_on < week_start);
end $$;

create or replace function public.notify_mark_weekly(uid uuid, today date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  update notification_settings set last_weekly_on = today where user_id = uid;
end $$;

-- Inhalt: eigene erledigte Aufgaben seit "since" und je Projekt, was das Team geschafft hat
create or replace function public.notify_week_review(uid uuid, since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  mine jsonb;
  team jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;

  -- Meine erledigten Aufgaben: mir zugeordnet, oder von mir angelegt und niemandem zugeordnet
  select coalesce(jsonb_agg(jsonb_build_object(
           'task_id', t.id, 'title', t.title, 'due_date', t.due_date, 'status', t.status,
           'project_id', p.id, 'project_name', p.name) order by t.completed_at), '[]'::jsonb)
  into mine
  from tasks t
  join projects p on p.id = t.project_id and p.archived_at is null
  where t.parent_id is null and t.status = 'done' and t.completed_at >= since
    and (
      exists (select 1 from task_assignees a where a.task_id = t.id and a.user_id = uid)
      or (t.created_by = uid and not exists (select 1 from task_assignees a where a.task_id = t.id))
    );

  -- Je Projekt (in dem die Person mitarbeitet): erledigt und neu im Team
  select coalesce(jsonb_agg(x order by x->>'project_name'), '[]'::jsonb) into team
  from (
    select jsonb_build_object(
             'project_id', p.id, 'project_name', p.name,
             'done', count(*) filter (where t.status = 'done' and t.completed_at >= since),
             'created', count(*) filter (where t.created_at >= since),
             'open', count(*) filter (where t.status <> 'done')) as x
    from projects p
    join tasks t on t.project_id = p.id and t.parent_id is null
    where p.archived_at is null
      and private.user_can_access_task(uid, t.id)
    group by p.id, p.name
    having count(*) filter (where (t.status = 'done' and t.completed_at >= since) or t.created_at >= since) > 0
  ) s;

  return jsonb_build_object('done', mine, 'team', team);
end $$;
