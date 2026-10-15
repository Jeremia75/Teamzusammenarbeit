-- Papierkorb: Gelöschte Aufgaben und Projekte bleiben 30 Tage wiederherstellbar.
-- Gelöschte Zeilen sind für die App unsichtbar (zusätzliche, einschränkende Regel).
-- In den Papierkorb legen, wiederherstellen und endgültig löschen geht nur über die Funktionen unten.

alter table public.tasks    add column deleted_at timestamptz, add column deleted_by uuid references auth.users (id) on delete set null;
alter table public.projects add column deleted_at timestamptz, add column deleted_by uuid references auth.users (id) on delete set null;
create index on public.tasks (deleted_at) where deleted_at is not null;
create index on public.projects (deleted_at) where deleted_at is not null;

create policy tasks_not_deleted on public.tasks as restrictive for all to authenticated, anon
  using (deleted_at is null) with check (deleted_at is null);
create policy projects_not_deleted on public.projects as restrictive for all to authenticated, anon
  using (deleted_at is null) with check (deleted_at is null);

-- Darf die angemeldete Person dieses Projekt löschen? (wie beim bisherigen Löschen; gilt auch im Papierkorb)
create or replace function private.can_delete_project(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p join workspaces w on w.id = p.workspace_id
    where p.id = proj and private.can_access_workspace(p.workspace_id)
      and (p.created_by = auth.uid() or private.is_org_admin(w.organization_id))
  );
$$;

-- Zugriff auf eine Aufgabe ohne Rücksicht auf den Papierkorb (für Papierkorb-Funktionen)
create or replace function private.can_access_task_any(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks tk join projects p on p.id = tk.project_id where tk.id = t and private.can_access_workspace(p.workspace_id));
$$;

-- ---------------------------------------------------------------------
-- In den Papierkorb
-- ---------------------------------------------------------------------
create or replace function public.trash_task(t uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ts timestamptz := now();
begin
  if not exists (select 1 from tasks where id = t and deleted_at is null) or not private.can_access_task_any(t) then
    raise exception 'Aufgabe nicht gefunden';
  end if;
  update tasks set deleted_at = ts, deleted_by = auth.uid()
  where (id = t or parent_id = t) and deleted_at is null;
end $$;

create or replace function public.trash_project(proj uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ts timestamptz := now();
begin
  if not exists (select 1 from projects where id = proj and deleted_at is null) then
    raise exception 'Projekt nicht gefunden';
  end if;
  if not private.can_delete_project(proj) then
    raise exception 'Dieses Projekt darfst du nicht löschen';
  end if;
  update projects set deleted_at = ts, deleted_by = auth.uid() where id = proj;
  update tasks set deleted_at = ts, deleted_by = auth.uid() where project_id = proj and deleted_at is null;
end $$;

-- ---------------------------------------------------------------------
-- Inhalt des Papierkorbs (nur, was man sehen darf)
-- ---------------------------------------------------------------------
create or replace function public.trash_list()
returns table (kind text, id uuid, title text, project_id uuid, project text, workspace text,
               deleted_at timestamptz, deleted_by text, task_count int, file_count int, can_purge boolean)
language sql stable security definer set search_path = public as $$
  -- einzeln gelöschte Aufgaben (Projekt noch da)
  select 'task', t.id, t.title, p.id, p.name, w.name, t.deleted_at,
         coalesce(nullif(pr.display_name, ''), 'Jemand'),
         (select count(*)::int from tasks s where s.parent_id = t.id),
         (select count(*)::int from task_attachments a join tasks x on x.id = a.task_id
           where a.kind = 'file' and (x.id = t.id or x.parent_id = t.id)),
         true
  from tasks t
  join projects p on p.id = t.project_id and p.deleted_at is null
  join workspaces w on w.id = p.workspace_id
  left join profiles pr on pr.id = t.deleted_by
  where t.deleted_at is not null
    and (t.parent_id is null or exists (select 1 from tasks par where par.id = t.parent_id and par.deleted_at is null))
    and private.can_access_workspace(p.workspace_id)
  union all
  select 'project', p.id, p.name, p.id, p.name, w.name, p.deleted_at,
         coalesce(nullif(pr.display_name, ''), 'Jemand'),
         (select count(*)::int from tasks t where t.project_id = p.id and t.parent_id is null),
         (select count(*)::int from task_attachments a join tasks x on x.id = a.task_id where a.kind = 'file' and x.project_id = p.id),
         private.can_delete_project(p.id)
  from projects p
  join workspaces w on w.id = p.workspace_id
  left join profiles pr on pr.id = p.deleted_by
  where p.deleted_at is not null and private.can_access_workspace(p.workspace_id)
  order by 7 desc;
$$;

-- ---------------------------------------------------------------------
-- Wiederherstellen
-- ---------------------------------------------------------------------
create or replace function public.trash_restore(k text, item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ts timestamptz;
begin
  if k = 'task' then
    select t.deleted_at into ts from tasks t join projects p on p.id = t.project_id
    where t.id = item and t.deleted_at is not null and p.deleted_at is null;
    if ts is null or not private.can_access_task_any(item) then raise exception 'Nicht im Papierkorb'; end if;
    update tasks set deleted_at = null, deleted_by = null where (id = item or parent_id = item) and deleted_at = ts;
  elsif k = 'project' then
    select deleted_at into ts from projects where id = item and deleted_at is not null;
    if ts is null or not private.can_delete_project(item) then raise exception 'Nicht im Papierkorb'; end if;
    update projects set deleted_at = null, deleted_by = null where id = item;
    update tasks set deleted_at = null, deleted_by = null where project_id = item and deleted_at = ts;
  else
    raise exception 'Unbekannte Art';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Endgültig löschen: erst die Dateien holen (zum Sichern bzw. Entfernen), dann löschen
-- ---------------------------------------------------------------------
create or replace function public.trash_files(k text, item uuid)
returns table (id uuid, name text, storage_path text, size bigint)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.storage_path, a.size
  from task_attachments a join tasks x on x.id = a.task_id
  where a.kind = 'file' and (
    (k = 'task' and (x.id = item or x.parent_id = item) and x.deleted_at is not null and private.can_access_task_any(item))
    or (k = 'project' and x.project_id = item and exists (select 1 from projects p where p.id = item and p.deleted_at is not null) and private.can_delete_project(item))
  )
  order by a.created_at;
$$;

create or replace function public.trash_purge(k text, item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if k = 'task' then
    if not exists (select 1 from tasks where id = item and deleted_at is not null) or not private.can_access_task_any(item) then
      raise exception 'Nicht im Papierkorb';
    end if;
    delete from tasks where id = item;
  elsif k = 'project' then
    if not exists (select 1 from projects where id = item and deleted_at is not null) or not private.can_delete_project(item) then
      raise exception 'Nicht im Papierkorb';
    end if;
    delete from projects where id = item;
  else
    raise exception 'Unbekannte Art';
  end if;
end $$;

revoke all on function public.trash_task(uuid), public.trash_project(uuid), public.trash_list(),
  public.trash_restore(text, uuid), public.trash_files(text, uuid), public.trash_purge(text, uuid) from public, anon;
grant execute on function public.trash_task(uuid), public.trash_project(uuid), public.trash_list(),
  public.trash_restore(text, uuid), public.trash_files(text, uuid), public.trash_purge(text, uuid) to authenticated;
revoke all on function private.can_delete_project(uuid), private.can_access_task_any(uuid) from public, anon;
grant execute on function private.can_delete_project(uuid), private.can_access_task_any(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Automatisch leeren nach 30 Tagen (aufgerufen vom Versand-Dienst mit service_role)
-- ---------------------------------------------------------------------
create or replace function public.trash_expired_files()
returns table (storage_path text)
language sql stable security definer set search_path = public as $$
  select a.storage_path from task_attachments a join tasks t on t.id = a.task_id
  left join projects p on p.id = t.project_id
  where a.kind = 'file' and a.storage_path is not null
    and (t.deleted_at < now() - interval '30 days' or p.deleted_at < now() - interval '30 days');
$$;

create or replace function public.trash_purge_expired()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; c int;
begin
  delete from projects where deleted_at < now() - interval '30 days';
  get diagnostics c = row_count; n := n + c;
  delete from tasks where deleted_at < now() - interval '30 days';
  get diagnostics c = row_count; n := n + c;
  return n;
end $$;
revoke all on function public.trash_expired_files(), public.trash_purge_expired() from public, anon, authenticated;
grant execute on function public.trash_expired_files(), public.trash_purge_expired() to service_role;

-- ---------------------------------------------------------------------
-- Funktionen, die an den Regeln vorbei lesen: Gelöschtes ausblenden
-- ---------------------------------------------------------------------
create or replace function private.user_can_access_task(uid uuid, t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks tk
    join projects p on p.id = tk.project_id and p.deleted_at is null
    join workspaces w on w.id = p.workspace_id
    where tk.id = t and tk.deleted_at is null and (
      exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = uid)
      or exists (select 1 from organization_members om where om.organization_id = w.organization_id and om.user_id = uid and om.role in ('owner', 'admin'))
    )
  );
$$;

create or replace function public.notify_open_tasks(uid uuid)
returns table (task_id uuid, title text, due_date date, status task_status, project_id uuid, project_name text)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.due_date, t.status, p.id, p.name
  from tasks t
  join projects p on p.id = t.project_id and p.archived_at is null and p.deleted_at is null
  where t.parent_id is null and t.deleted_at is null
    and t.status <> 'done'
    and (
      exists (select 1 from task_assignees a where a.task_id = t.id and a.user_id = uid)
      or (t.created_by = uid and not exists (select 1 from task_assignees a where a.task_id = t.id))
    )
  order by t.due_date nulls last, t.position;
$$;

create or replace function public.notify_pending_assignments()
returns table (outbox_id bigint, user_id uuid, task_id uuid, title text, due_date date,
               project_id uuid, project_name text, actor_name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.user_id, t.id, t.title, t.due_date, p.id, p.name,
         coalesce(nullif(ap.display_name, ''), 'Jemand')
  from email_outbox o
  join tasks t on t.id = o.task_id and t.deleted_at is null
  join projects p on p.id = t.project_id and p.deleted_at is null
  join notification_settings s on s.user_id = o.user_id and s.email_enabled and s.on_assigned
  left join profiles ap on ap.id = o.actor_id
  where o.sent_at is null and o.attempts < 5
    and exists (select 1 from task_assignees a where a.task_id = o.task_id and a.user_id = o.user_id)
  order by o.created_at;
$$;

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
  join projects p on p.id = t.project_id and p.archived_at is null and p.deleted_at is null
  where t.deleted_at is null
    and (t.due_date is not null or t.start_date is not null)
    and coalesce(t.due_date, t.start_date) >= current_date - 60
    and (exists (select 1 from task_assignees a where a.task_id = t.id and a.user_id = uid)
         or (t.created_by = uid and not exists (select 1 from task_assignees a where a.task_id = t.id)))
    and private.user_can_access_task(uid, t.id)
  union all
  select 'milestone'::text, m.id, m.name, m.due_date, m.due_date, p.name, p.id, null::text, null::text
  from milestones m
  join projects p on p.id = m.project_id and p.archived_at is null and p.deleted_at is null
  join workspaces w on w.id = p.workspace_id
  where m.due_date is not null and m.due_date >= current_date - 60
    and (exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = uid)
         or exists (select 1 from organization_members om where om.organization_id = w.organization_id and om.user_id = uid and om.role in ('owner', 'admin')))
  limit 2000;
end $$;
