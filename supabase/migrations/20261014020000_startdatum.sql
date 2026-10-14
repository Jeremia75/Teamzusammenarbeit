-- Beginn (Startdatum) für Aufgaben – Grundlage für den Zeitplan (Gantt).

alter table public.tasks add column start_date date;
alter table public.tasks add constraint tasks_start_before_due
  check (start_date is null or due_date is null or start_date <= due_date);

-- Wiederkehrende Aufgaben: Beginn mit in die nächste Runde nehmen
create or replace function public.tasks_spawn_recurrence()
returns trigger language plpgsql set search_path = public as $$
declare
  next_id    uuid := gen_random_uuid();
  next_due   date;
  next_start date;
begin
  if new.recurrence is null or new.recurrence_spawned
     or new.status <> 'done' or old.status = 'done' then
    return new;
  end if;

  next_due := private.next_occurrence(coalesce(old.due_date, current_date), new.recurrence);
  if next_due < current_date then
    next_due := private.next_occurrence(current_date, new.recurrence);
  end if;

  -- Beginn mitverschieben, Dauer bleibt gleich
  if new.start_date is not null then
    next_start := next_due - (coalesce(old.due_date, new.start_date) - new.start_date);
  end if;

  new.recurrence_spawned := true;

  insert into tasks (id, project_id, parent_id, milestone_id, section_id, title, description,
                     status, priority, start_date, due_date, position, recurrence, created_by)
  values (next_id, new.project_id, new.parent_id, new.milestone_id, new.section_id, new.title, new.description,
          'todo', new.priority, next_start, next_due, new.position + 0.001, new.recurrence, new.created_by);

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

