-- =====================================================================
-- Gäste in einzelnen Projekten
--
-- Externe (z. B. Steuerberatung) bekommen Zugriff auf ausgewählte Projekte,
-- ohne den ganzen Bereich zu sehen. Je Projekt eine Rolle:
-- editor (Bearbeiten), commenter (Kommentieren), viewer (Nur ansehen).
-- Gäste sehen den Bereich nur mit ihren freigegebenen Projekten.
-- Freigeben und Rollen ändern dürfen Admins der Firma.
-- Das Entfernen eines Gastes steht in supabase/manuell_projekt_gaeste.sql.
-- =====================================================================

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'viewer' check (role in ('editor', 'commenter', 'viewer')),
  added_by   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index on public.project_members (user_id);
alter table public.project_members enable row level security;
-- Absichtlich keine Regeln zum Schreiben: nur über die Funktionen unten.

-- Ist die angemeldete Person Gast in einem Projekt dieses Bereichs?
create or replace function private.is_guest_in_workspace(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm join projects p on p.id = pm.project_id
    where p.workspace_id = ws and pm.user_id = auth.uid()
  );
$$;

-- Zugriff auf ein Projekt: über den Bereich ODER als Gast
create or replace function private.can_access_project(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    where p.id = proj and (
      private.can_access_workspace(p.workspace_id)
      or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
    )
  );
$$;

create or replace function private.can_access_task_any(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks tk where tk.id = t and private.can_access_project(tk.project_id));
$$;

-- Meine Rolle in einem Projekt: die stärkere aus Bereich und Gast-Freigabe
create or replace function private.project_role(proj uuid)
returns text language sql stable security definer set search_path = public as $$
  with r as (
    select private.ws_role(p.workspace_id) as w,
           (select pm.role from project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()) as g
    from projects p where p.id = proj
  )
  select case
    when w = 'editor' or g = 'editor' then 'editor'
    when w = 'commenter' or g = 'commenter' then 'commenter'
    when w = 'viewer' or g = 'viewer' then 'viewer'
  end from r;
$$;

create or replace function private.can_edit_project(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(private.project_role(proj) = 'editor', false);
$$;

create or replace function private.can_edit_task(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks tk where tk.id = t and private.can_edit_project(tk.project_id));
$$;

create or replace function private.can_comment_task(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks tk where tk.id = t and coalesce(private.project_role(tk.project_id) in ('editor', 'commenter'), false)
  );
$$;

grant execute on function private.is_guest_in_workspace(uuid), private.project_role(uuid) to authenticated;

-- Für Mitteilungen und E-Mails: darf eine bestimmte Person die Aufgabe sehen?
create or replace function private.user_can_access_task(uid uuid, t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks tk
    join projects p on p.id = tk.project_id and p.deleted_at is null
    join workspaces w on w.id = p.workspace_id
    where tk.id = t and tk.deleted_at is null and (
      exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = uid)
      or exists (select 1 from organization_members om where om.organization_id = w.organization_id and om.user_id = uid and om.role in ('owner', 'admin'))
      or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = uid)
    )
  );
$$;

-- ---------------------------------------------------------------------
-- Was Gäste sehen: ihr Projekt, den Bereich (nur Name) und wer dort mitarbeitet
-- ---------------------------------------------------------------------
create policy project_members_select on public.project_members for select to authenticated
  using (private.can_access_project(project_id));

create policy projects_guest_select on public.projects for select to authenticated
  using (exists (select 1 from public.project_members pm where pm.project_id = id and pm.user_id = auth.uid()));

create policy ws_guest_select on public.workspaces for select to authenticated
  using (private.is_guest_in_workspace(id));

create policy ws_members_guest_select on public.workspace_members for select to authenticated
  using (private.is_guest_in_workspace(workspace_id));

-- Papierkorb: auch Gäste mit Bearbeiten-Recht sehen ihre gelöschten Aufgaben
create or replace function public.trash_list()
returns table (kind text, id uuid, title text, project_id uuid, project text, workspace text,
               deleted_at timestamptz, deleted_by text, task_count int, file_count int, can_purge boolean)
language sql stable security definer set search_path = public as $$
  select 'task', t.id, t.title, p.id, p.name, w.name, t.deleted_at,
         coalesce(nullif(pr.display_name, ''), 'Jemand'),
         (select count(*)::int from tasks s where s.parent_id = t.id),
         (select count(*)::int from task_attachments a join tasks x on x.id = a.task_id
           where a.kind = 'file' and (x.id = t.id or x.parent_id = t.id)),
         private.can_edit_project(p.id)
  from tasks t
  join projects p on p.id = t.project_id and p.deleted_at is null
  join workspaces w on w.id = p.workspace_id
  left join profiles pr on pr.id = t.deleted_by
  where t.deleted_at is not null
    and (t.parent_id is null or exists (select 1 from tasks par where par.id = t.parent_id and par.deleted_at is null))
    and private.can_access_project(p.id)
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

-- Kalender-Abo: Meilensteine auch aus freigegebenen Projekten
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
         or exists (select 1 from organization_members om where om.organization_id = w.organization_id and om.user_id = uid and om.role in ('owner', 'admin'))
         or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = uid))
  limit 2000;
end $$;

-- ---------------------------------------------------------------------
-- Freigeben (nur Admins der Firma)
-- ---------------------------------------------------------------------
create or replace function public.add_project_guest(proj uuid, guest_email text, guest_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  org      uuid;
  personal boolean;
  uid      uuid;
begin
  if guest_role not in ('editor', 'commenter', 'viewer') then
    raise exception 'Unbekannte Rolle';
  end if;
  select w.organization_id, o.is_personal into org, personal
  from projects p join workspaces w on w.id = p.workspace_id join organizations o on o.id = w.organization_id
  where p.id = proj and p.deleted_at is null;
  if org is null or not private.is_org_admin(org) then
    raise exception 'Freigeben dürfen nur Admins der Firma';
  end if;
  if personal then
    raise exception 'Private Projekte können nicht freigegeben werden';
  end if;

  select id into uid from auth.users where lower(email) = lower(trim(guest_email));
  if uid is null then
    return 'not_found';
  end if;

  insert into organization_members (organization_id, user_id, role)
  values (org, uid, 'member') on conflict do nothing;
  insert into project_members (project_id, user_id, role, added_by)
  values (proj, uid, guest_role, auth.uid())
  on conflict (project_id, user_id) do update set role = excluded.role;
  return 'added';
end $$;

create or replace function public.set_project_guest_role(proj uuid, guest uuid, guest_role text)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  if guest_role not in ('editor', 'commenter', 'viewer') then
    raise exception 'Unbekannte Rolle';
  end if;
  select w.organization_id into org from projects p join workspaces w on w.id = p.workspace_id where p.id = proj;
  if org is null or not private.is_org_admin(org) then
    raise exception 'Freigeben dürfen nur Admins der Firma';
  end if;
  update project_members set role = guest_role where project_id = proj and user_id = guest;
  if not found then
    raise exception 'Diese Person ist kein Gast in diesem Projekt';
  end if;
end $$;

grant execute on function public.add_project_guest(uuid, text, text), public.set_project_guest_role(uuid, uuid, text) to authenticated;
