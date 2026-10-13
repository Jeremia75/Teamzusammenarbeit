-- =====================================================================
-- Rubriken (frei definierbare Board-Spalten pro Projekt) und
-- wiederkehrende Aufgaben
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rubriken
-- ---------------------------------------------------------------------
create table public.sections (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index on public.sections (project_id, position);

alter table public.sections enable row level security;
create policy sections_all on public.sections for all
  using (private.can_access_project(project_id))
  with check (private.can_access_project(project_id));

alter table public.tasks
  add column section_id uuid references public.sections (id) on delete set null;
create index on public.tasks (section_id, position);

-- ---------------------------------------------------------------------
-- Wiederholung
-- ---------------------------------------------------------------------
create type public.task_recurrence as enum ('daily', 'weekly', 'biweekly', 'monthly', 'yearly');

alter table public.tasks
  add column recurrence public.task_recurrence,
  add column recurrence_spawned boolean not null default false;

-- Abschnitt und Meilenstein müssen zum selben Projekt gehören
create or replace function public.tasks_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.tasks p
    where p.id = new.parent_id and p.project_id = new.project_id
  ) then
    raise exception 'Unteraufgabe muss im selben Projekt liegen wie die übergeordnete Aufgabe';
  end if;

  if new.milestone_id is not null and not exists (
    select 1 from public.milestones m
    where m.id = new.milestone_id and m.project_id = new.project_id
  ) then
    raise exception 'Meilenstein gehört zu einem anderen Projekt';
  end if;

  if new.section_id is not null and not exists (
    select 1 from public.sections s
    where s.id = new.section_id and s.project_id = new.project_id
  ) then
    raise exception 'Rubrik gehört zu einem anderen Projekt';
  end if;

  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

-- Nächstes Fälligkeitsdatum einer Wiederholung
create or replace function private.next_occurrence(base date, rule public.task_recurrence)
returns date language sql immutable set search_path = public as $$
  select (case rule
    when 'daily'    then base + interval '1 day'
    when 'weekly'   then base + interval '7 days'
    when 'biweekly' then base + interval '14 days'
    when 'monthly'  then base + interval '1 month'
    when 'yearly'   then base + interval '1 year'
  end)::date;
$$;

-- Wird eine wiederkehrende Aufgabe erledigt, entsteht die nächste
-- (einmalig – erneutes Abhaken nach Zurücksetzen erzeugt keine weitere).
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
  -- liegt die alte Fälligkeit weit zurück, ab heute weiterrechnen
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

  -- Unteraufgaben als neue, offene Checkliste mitnehmen
  insert into tasks (project_id, parent_id, title, description, status, priority, position, created_by)
  select project_id, next_id, title, description, 'todo', priority, position, created_by
  from tasks where parent_id = new.id;

  return new;
end $$;

create trigger tasks_spawn_recurrence before update of status on public.tasks
  for each row execute function public.tasks_spawn_recurrence();

revoke all on function private.next_occurrence(date, public.task_recurrence) from public, anon;
grant execute on function private.next_occurrence(date, public.task_recurrence) to authenticated;

-- Echtzeit auch für Rubriken
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sections;
  end if;
end $$;
