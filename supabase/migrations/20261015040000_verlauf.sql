-- =====================================================================
-- Verlauf je Aufgabe: wer hat wann was geändert
--
-- Einträge schreibt nur die Datenbank selbst (Trigger). Lesen darf, wer die
-- Aufgabe sehen darf. Mehrere Änderungen am selben Feld durch dieselbe Person
-- innerhalb von 10 Minuten werden zu einem Eintrag zusammengefasst
-- (z. B. beim Tippen der Beschreibung).
-- Die Einträge fürs Entfernen von Verantwortlichen und Anhängen stehen in
-- supabase/manuell_rollen_verlauf.sql.
-- =====================================================================

create table public.task_history (
  id         bigint generated always as identity primary key,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  actor_id   uuid references auth.users (id) on delete set null,
  via_ai     boolean not null default false,
  field      text not null,
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now()
);
create index on public.task_history (task_id, created_at desc);

alter table public.task_history enable row level security;
create policy task_history_select on public.task_history for select to authenticated
  using (private.can_access_task(task_id));
-- Absichtlich keine Regeln zum Schreiben: nur die Trigger unten schreiben.

-- Einen Eintrag schreiben (oder mit dem letzten zusammenfassen)
create or replace function private.log_task(t uuid, f text, o text, n text, merge boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  ai   boolean := coalesce(nullif(auth.jwt() ->> 'client_id', ''), '') <> '';
  last bigint;
begin
  if merge then
    select h.id into last from task_history h
    where h.task_id = t and h.field = f and h.actor_id is not distinct from uid
      and h.created_at > now() - interval '10 minutes'
      and h.id = (select max(id) from task_history where task_id = t)
    limit 1;
    if last is not null then
      update task_history set new_value = n, created_at = now() where id = last;
      return;
    end if;
  end if;
  insert into task_history (task_id, actor_id, via_ai, field, old_value, new_value) values (t, uid, ai, f, o, n);
end $$;

-- Aufgabe angelegt / geändert
create or replace function private.history_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_task(new.id, 'created', null, new.title);
    return new;
  end if;

  if new.title is distinct from old.title then
    perform private.log_task(new.id, 'title', old.title, new.title, true);
  end if;
  if new.description is distinct from old.description then
    perform private.log_task(new.id, 'description', null, null, true);
  end if;
  if new.status is distinct from old.status then
    perform private.log_task(new.id, 'status', old.status::text, new.status::text, true);
  end if;
  if new.priority is distinct from old.priority then
    perform private.log_task(new.id, 'priority', old.priority::text, new.priority::text, true);
  end if;
  if new.start_date is distinct from old.start_date then
    perform private.log_task(new.id, 'start_date', old.start_date::text, new.start_date::text, true);
  end if;
  if new.due_date is distinct from old.due_date then
    perform private.log_task(new.id, 'due_date', old.due_date::text, new.due_date::text, true);
  end if;
  if new.section_id is distinct from old.section_id then
    perform private.log_task(new.id, 'section',
      (select name from sections where id = old.section_id), (select name from sections where id = new.section_id), true);
  end if;
  if new.milestone_id is distinct from old.milestone_id then
    perform private.log_task(new.id, 'milestone',
      (select name from milestones where id = old.milestone_id), (select name from milestones where id = new.milestone_id), true);
  end if;
  if new.recurrence is distinct from old.recurrence then
    perform private.log_task(new.id, 'recurrence', old.recurrence::text, new.recurrence::text, true);
  end if;
  if new.parent_id is null and new.project_id is distinct from old.project_id then
    perform private.log_task(new.id, 'project',
      (select name from projects where id = old.project_id), (select name from projects where id = new.project_id));
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    perform private.log_task(new.id, 'trashed', null, null);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform private.log_task(new.id, 'restored', null, null);
  end if;
  return new;
end $$;

create trigger tasks_history after insert or update on public.tasks
  for each row execute function private.history_tasks();

-- Verantwortliche hinzugefügt
create or replace function private.history_assignee_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.log_task(new.task_id, 'assignee_added', null,
    coalesce((select nullif(display_name, '') from profiles where id = new.user_id), 'Unbenannt'));
  return new;
end $$;
create trigger task_assignees_history after insert on public.task_assignees
  for each row execute function private.history_assignee_added();

-- Datei oder Link angehängt
create or replace function private.history_attachment_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.log_task(new.task_id, 'attachment_added', new.kind, new.name);
  return new;
end $$;
create trigger task_attachments_history after insert on public.task_attachments
  for each row execute function private.history_attachment_added();

-- Abhängigkeit hinzugefügt ("wartet auf")
create or replace function private.history_dependency_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.log_task(new.task_id, 'dependency_added', null, (select title from tasks where id = new.depends_on));
  return new;
end $$;
create trigger task_dependencies_history after insert on public.task_dependencies
  for each row execute function private.history_dependency_added();

-- Bisherige Aufgaben: Anlage-Eintrag nachtragen, damit der Verlauf nicht leer beginnt
insert into public.task_history (task_id, actor_id, field, new_value, created_at)
select id, created_by, 'created', title, created_at from public.tasks;
