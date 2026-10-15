-- Verlauf: "angelegt" auch ohne angemeldete Person der Erstellerin bzw. dem Ersteller zuordnen

create or replace function private.history_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Ohne angemeldete Person (z. B. Import) zählt, wer als Ersteller eingetragen ist
    insert into task_history (task_id, actor_id, via_ai, field, new_value)
    values (new.id, coalesce(auth.uid(), new.created_by), coalesce(nullif(auth.jwt() ->> 'client_id', ''), '') <> '', 'created', new.title);
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
