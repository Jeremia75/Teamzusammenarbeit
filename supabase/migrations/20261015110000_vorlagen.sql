-- =====================================================================
-- Projektvorlagen
--
-- Ein Projekt lässt sich als Vorlage speichern (Rubriken, Meilensteine,
-- Aufgaben mit Unteraufgaben und "Wartet auf"). Beim Anlegen aus der Vorlage
-- werden alle Termine relativ zum gewählten Startdatum neu berechnet.
-- Verantwortliche, Kommentare und Dateien werden nicht übernommen.
-- =====================================================================

create table public.project_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  description  text not null default '',
  data         jsonb not null,
  task_count   int not null default 0,
  span_days    int,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create index on public.project_templates (workspace_id);

alter table public.project_templates enable row level security;
create policy project_templates_select on public.project_templates for select to authenticated
  using (archived_at is null and private.can_access_workspace(workspace_id));
-- Schreiben nur über die Funktionen unten

-- ---------------------------------------------------------------------
-- Projekt als Vorlage speichern
-- ---------------------------------------------------------------------
create or replace function public.save_project_template(proj uuid, tpl_name text, tpl_description text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ws    uuid;
  ref   date;
  last  date;
  doc   jsonb;
  n     int;
  new_id uuid;
begin
  select workspace_id into ws from projects where id = proj and deleted_at is null;
  if ws is null or not private.can_edit_project(proj) then
    raise exception 'Dieses Projekt darfst du nicht als Vorlage speichern';
  end if;
  if coalesce(trim(tpl_name), '') = '' then
    raise exception 'Bitte gib der Vorlage einen Namen';
  end if;

  -- Bezugstag: der früheste Termin im Projekt
  select min(d), max(d) into ref, last from (
    select start_date as d from tasks where project_id = proj and deleted_at is null
    union all select due_date from tasks where project_id = proj and deleted_at is null
    union all select due_date from milestones where project_id = proj
  ) x;

  doc := jsonb_build_object(
    'sections', coalesce((select jsonb_agg(jsonb_build_object('key', s.id, 'name', s.name, 'position', s.position) order by s.position)
                          from sections s where s.project_id = proj), '[]'::jsonb),
    'milestones', coalesce((select jsonb_agg(jsonb_build_object('key', m.id, 'name', m.name, 'position', m.position,
                                                                'due', m.due_date - ref) order by m.position)
                            from milestones m where m.project_id = proj), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
                 'key', t.id, 'parent', t.parent_id, 'title', t.title, 'description', t.description,
                 'priority', t.priority, 'recurrence', t.recurrence, 'position', t.position,
                 'section', t.section_id, 'milestone', t.milestone_id,
                 'start', t.start_date - ref, 'due', t.due_date - ref) order by t.parent_id nulls first, t.position)
               from tasks t where t.project_id = proj and t.deleted_at is null), '[]'::jsonb),
    'deps', coalesce((select jsonb_agg(jsonb_build_object('task', d.task_id, 'on', d.depends_on))
                      from task_dependencies d
                      join tasks a on a.id = d.task_id and a.deleted_at is null
                      join tasks b on b.id = d.depends_on and b.deleted_at is null
                      where d.project_id = proj), '[]'::jsonb)
  );
  select count(*) into n from tasks where project_id = proj and deleted_at is null and parent_id is null;

  insert into project_templates (workspace_id, name, description, data, task_count, span_days, created_by)
  values (ws, left(trim(tpl_name), 120), coalesce(tpl_description, ''), doc, n, last - ref, auth.uid())
  returning id into new_id;
  return new_id;
end $$;

-- ---------------------------------------------------------------------
-- Neues Projekt aus einer Vorlage
-- ---------------------------------------------------------------------
create or replace function public.create_project_from_template(tpl uuid, ws uuid, proj_name text, start_on date default current_date, section uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t      project_templates;
  proj   uuid;
  ids    jsonb := '{}'::jsonb;   -- alte Schlüssel → neue IDs
  item   jsonb;
  new_id uuid;
  pos    double precision;
  colors text[] := array['#1F5FBF', '#0E7C66', '#6B4FB3', '#B4561C', '#8A6A12', '#B0336B'];
  day0   date := coalesce(start_on, current_date);
begin
  select * into t from project_templates where id = tpl and archived_at is null;
  if t.id is null or not private.can_access_workspace(t.workspace_id) then
    raise exception 'Vorlage nicht gefunden';
  end if;
  if not private.can_edit_workspace(ws) then
    raise exception 'In diesem Bereich darfst du keine Projekte anlegen';
  end if;
  if coalesce(trim(proj_name), '') = '' then
    raise exception 'Bitte gib dem Projekt einen Namen';
  end if;
  if section is not null and not exists (select 1 from project_sections where id = section and workspace_id = ws) then
    section := null;
  end if;

  select coalesce(max(position), 0) + 1 into pos from projects
  where workspace_id = ws and section_id is not distinct from section and deleted_at is null;

  insert into projects (workspace_id, name, description, color, created_by, section_id, position)
  values (ws, left(trim(proj_name), 120), t.description, colors[1 + floor(random() * 6)::int], auth.uid(), section, pos)
  returning id into proj;

  for item in select * from jsonb_array_elements(t.data -> 'sections') loop
    insert into sections (project_id, name, position) values (proj, item ->> 'name', (item ->> 'position')::double precision)
    returning id into new_id;
    ids := ids || jsonb_build_object(item ->> 'key', new_id);
  end loop;

  for item in select * from jsonb_array_elements(t.data -> 'milestones') loop
    insert into milestones (project_id, name, position, due_date)
    values (proj, item ->> 'name', (item ->> 'position')::double precision, day0 + (item ->> 'due')::int)
    returning id into new_id;
    ids := ids || jsonb_build_object(item ->> 'key', new_id);
  end loop;

  -- erst Hauptaufgaben, dann Unteraufgaben (so stehen die Eltern schon fest)
  for item in
    select e from jsonb_array_elements(t.data -> 'tasks') e order by (e ->> 'parent') is not null, (e ->> 'position')::double precision
  loop
    insert into tasks (project_id, parent_id, title, description, priority, recurrence, position, section_id, milestone_id,
                       start_date, due_date, created_by)
    values (
      proj,
      (ids ->> (item ->> 'parent'))::uuid,
      item ->> 'title',
      coalesce(item ->> 'description', ''),
      coalesce(item ->> 'priority', 'medium')::task_priority,
      (item ->> 'recurrence')::task_recurrence,
      (item ->> 'position')::double precision,
      (ids ->> (item ->> 'section'))::uuid,
      (ids ->> (item ->> 'milestone'))::uuid,
      day0 + (item ->> 'start')::int,
      day0 + (item ->> 'due')::int,
      auth.uid()
    )
    returning id into new_id;
    ids := ids || jsonb_build_object(item ->> 'key', new_id);
  end loop;

  for item in select * from jsonb_array_elements(t.data -> 'deps') loop
    if ids ? (item ->> 'task') and ids ? (item ->> 'on') then
      insert into task_dependencies (task_id, depends_on, project_id)
      values ((ids ->> (item ->> 'task'))::uuid, (ids ->> (item ->> 'on'))::uuid, proj)
      on conflict do nothing;
    end if;
  end loop;

  return proj;
end $$;

-- Vorlage umbenennen oder entfernen (bleibt gespeichert, wird nur ausgeblendet)
create or replace function public.update_project_template(tpl uuid, tpl_name text, tpl_description text, remove boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select workspace_id into ws from project_templates where id = tpl and archived_at is null;
  if ws is null or not private.can_edit_workspace(ws) then
    raise exception 'Diese Vorlage darfst du nicht ändern';
  end if;
  if remove then
    update project_templates set archived_at = now() where id = tpl;
  else
    if coalesce(trim(tpl_name), '') = '' then raise exception 'Bitte gib der Vorlage einen Namen'; end if;
    update project_templates set name = left(trim(tpl_name), 120), description = coalesce(tpl_description, '') where id = tpl;
  end if;
end $$;

grant execute on function public.save_project_template(uuid, text, text), public.create_project_from_template(uuid, uuid, text, date, uuid),
  public.update_project_template(uuid, text, text, boolean) to authenticated;
