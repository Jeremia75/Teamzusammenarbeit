-- =====================================================================
-- Rollen je Bereich
--
--   editor    = Bearbeiten (wie bisher: alles anlegen, ändern, löschen)
--   commenter = Kommentieren (alles sehen, nur Kommentare schreiben)
--   viewer    = Nur ansehen (z. B. Gäste wie die Steuerberatung)
--
-- Admins und Eigentümer der Organisation dürfen immer bearbeiten.
-- Umgesetzt mit zusätzlichen, einschränkenden Regeln – die bestehenden
-- Regeln bleiben unverändert. Die Regeln fürs Löschen stehen in
-- supabase/manuell_rollen_verlauf.sql.
-- =====================================================================

alter table public.workspace_members
  add column role text not null default 'editor' check (role in ('editor', 'commenter', 'viewer'));

-- Rolle der angemeldeten Person in einem Bereich (null = kein Zugriff)
create or replace function private.ws_role(ws uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from workspaces w
      join organization_members om on om.organization_id = w.organization_id
      where w.id = ws and om.user_id = auth.uid() and om.role in ('owner', 'admin')
    ) then 'editor'
    else (select role from workspace_members where workspace_id = ws and user_id = auth.uid())
  end;
$$;

create or replace function private.can_edit_workspace(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(private.ws_role(ws) = 'editor', false);
$$;

-- Projekt bzw. Aufgabe bearbeiten (auch wenn sie im Papierkorb liegen)
create or replace function private.can_edit_project(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects p where p.id = proj and private.can_edit_workspace(p.workspace_id));
$$;

create or replace function private.can_edit_task(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks tk join projects p on p.id = tk.project_id
    where tk.id = t and private.can_edit_workspace(p.workspace_id)
  );
$$;

create or replace function private.can_comment_task(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks tk join projects p on p.id = tk.project_id
    where tk.id = t and coalesce(private.ws_role(p.workspace_id) in ('editor', 'commenter'), false)
  );
$$;

grant execute on function private.ws_role(uuid), private.can_edit_workspace(uuid), private.can_edit_project(uuid),
  private.can_edit_task(uuid), private.can_comment_task(uuid) to authenticated;

-- Projekt löschen: zusätzlich Bearbeiten-Recht im Bereich
create or replace function private.can_delete_project(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p join workspaces w on w.id = p.workspace_id
    where p.id = proj and private.can_edit_workspace(p.workspace_id)
      and (p.created_by = auth.uid() or private.is_org_admin(w.organization_id))
  );
$$;

-- ---------------------------------------------------------------------
-- Anlegen und Ändern nur mit Bearbeiten-Recht
-- ---------------------------------------------------------------------
create policy projects_edit_ins on public.projects as restrictive for insert to authenticated
  with check (private.can_edit_workspace(workspace_id));
create policy projects_edit_upd on public.projects as restrictive for update to authenticated
  using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));

create policy project_sections_edit_ins on public.project_sections as restrictive for insert to authenticated
  with check (private.can_edit_workspace(workspace_id));
create policy project_sections_edit_upd on public.project_sections as restrictive for update to authenticated
  using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));

create policy goals_edit_ins on public.goals as restrictive for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy goals_edit_upd on public.goals as restrictive for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));

create policy milestones_edit_ins on public.milestones as restrictive for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy milestones_edit_upd on public.milestones as restrictive for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));

create policy sections_edit_ins on public.sections as restrictive for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy sections_edit_upd on public.sections as restrictive for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));

create policy tasks_edit_ins on public.tasks as restrictive for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy tasks_edit_upd on public.tasks as restrictive for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));

create policy assignees_edit_ins on public.task_assignees as restrictive for insert to authenticated
  with check (private.can_edit_task(task_id));
create policy assignees_edit_upd on public.task_assignees as restrictive for update to authenticated
  using (private.can_edit_task(task_id)) with check (private.can_edit_task(task_id));

create policy task_attachments_edit_ins on public.task_attachments as restrictive for insert to authenticated
  with check (private.can_edit_task(task_id));
create policy task_attachments_edit_upd on public.task_attachments as restrictive for update to authenticated
  using (private.can_edit_task(task_id)) with check (private.can_edit_task(task_id));

create policy task_dependencies_edit_ins on public.task_dependencies as restrictive for insert to authenticated
  with check (private.can_edit_task(task_id));

-- Kommentare: Bearbeiten oder Kommentieren
create policy comments_role_ins on public.comments as restrictive for insert to authenticated
  with check (private.can_comment_task(task_id));
create policy comments_role_upd on public.comments as restrictive for update to authenticated
  using (private.can_comment_task(task_id)) with check (private.can_comment_task(task_id));

-- Dateien hochladen (Speicher), falls Supabase Storage vorhanden ist
do $outer$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Speicher übersprungen: kein Storage vorhanden';
    return;
  end if;
  execute $p$
    create policy anhaenge_edit_ins on storage.objects as restrictive for insert to authenticated
      with check (bucket_id <> 'anhaenge' or private.can_edit_task(((storage.foldername(name))[1])::uuid))
  $p$;
end
$outer$;

-- ---------------------------------------------------------------------
-- Papierkorb: in den Papierkorb legen und wiederherstellen nur mit Bearbeiten-Recht
-- ---------------------------------------------------------------------
create or replace function public.trash_task(t uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ts timestamptz := now();
begin
  if not exists (select 1 from tasks where id = t and deleted_at is null) or not private.can_access_task_any(t) then
    raise exception 'Aufgabe nicht gefunden';
  end if;
  if not private.can_edit_task(t) then
    raise exception 'Du kannst in diesem Bereich nur ansehen';
  end if;
  update tasks set deleted_at = ts, deleted_by = auth.uid()
  where (id = t or parent_id = t) and deleted_at is null;
end $$;

create or replace function public.trash_restore(k text, item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ts timestamptz;
begin
  if k = 'task' then
    select t.deleted_at into ts from tasks t join projects p on p.id = t.project_id
    where t.id = item and t.deleted_at is not null and p.deleted_at is null;
    if ts is null or not private.can_edit_task(item) then raise exception 'Nicht im Papierkorb'; end if;
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

-- can_purge gilt jetzt auch für Aufgaben: nur mit Bearbeiten-Recht
create or replace function public.trash_list()
returns table (kind text, id uuid, title text, project_id uuid, project text, workspace text,
               deleted_at timestamptz, deleted_by text, task_count int, file_count int, can_purge boolean)
language sql stable security definer set search_path = public as $$
  select 'task', t.id, t.title, p.id, p.name, w.name, t.deleted_at,
         coalesce(nullif(pr.display_name, ''), 'Jemand'),
         (select count(*)::int from tasks s where s.parent_id = t.id),
         (select count(*)::int from task_attachments a join tasks x on x.id = a.task_id
           where a.kind = 'file' and (x.id = t.id or x.parent_id = t.id)),
         private.can_edit_workspace(p.workspace_id)
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
-- Mitglieder: mit Rolle hinzufügen und Rolle ändern (nur Admins)
-- ---------------------------------------------------------------------
create or replace function public.add_member_by_email(ws uuid, member_email text, member_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  org      uuid;
  personal boolean;
  uid      uuid;
begin
  if member_role not in ('editor', 'commenter', 'viewer') then
    raise exception 'Unbekannte Rolle';
  end if;
  select w.organization_id, o.is_personal into org, personal
  from workspaces w join organizations o on o.id = w.organization_id
  where w.id = ws;

  if org is null or not private.is_org_admin(org) then
    raise exception 'Keine Berechtigung für diesen Bereich';
  end if;
  if personal then
    raise exception 'Private Bereiche können nicht geteilt werden';
  end if;

  select id into uid from auth.users where lower(email) = lower(trim(member_email));
  if uid is null then
    return 'not_found';
  end if;

  insert into organization_members (organization_id, user_id, role)
  values (org, uid, 'member') on conflict do nothing;
  insert into workspace_members (workspace_id, user_id, role)
  values (ws, uid, member_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  return 'added';
end $$;

create or replace function public.set_member_role(ws uuid, member uuid, member_role text)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  if member_role not in ('editor', 'commenter', 'viewer') then
    raise exception 'Unbekannte Rolle';
  end if;
  select organization_id into org from workspaces where id = ws;
  if org is null or not private.is_org_admin(org) then
    raise exception 'Keine Berechtigung für diesen Bereich';
  end if;
  update workspace_members set role = member_role where workspace_id = ws and user_id = member;
  if not found then
    raise exception 'Diese Person ist nicht im Bereich';
  end if;
end $$;

grant execute on function public.add_member_by_email(uuid, text, text), public.set_member_role(uuid, uuid, text) to authenticated;
