-- =====================================================================
-- Einladen per E-Mail
--
-- Wer beim Hinzufügen (Bereich oder Projekt-Gast) eine Adresse eingibt,
-- die noch kein Konto hat, legt eine Einladung an. Der Dienst
-- "benachrichtigungen" schickt die Mail sofort (wird gleich angestoßen).
-- Sobald sich jemand mit dieser Adresse registriert und die Adresse
-- bestätigt ist, wird die Person automatisch Mitglied bzw. Gast.
--
-- Hinweis: Diese Datei enthält bewusst keine Lösch-Befehle (siehe CLAUDE.md);
-- Zurückziehen setzt withdrawn_at.
-- =====================================================================

create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  email           text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  organization_id uuid not null,
  workspace_id    uuid,             -- Einladung in einen Bereich …
  project_id      uuid,             -- … oder als Gast in ein Projekt
  role            text not null check (role in ('editor', 'commenter', 'viewer')),
  invited_by      uuid not null default auth.uid(),
  created_at      timestamptz not null default now(),
  mailed_at       timestamptz,
  mail_error      text,
  accepted_at     timestamptz,
  accepted_by     uuid,
  withdrawn_at    timestamptz,
  check ((workspace_id is null) <> (project_id is null))
);
create unique index invitations_open_once
  on public.invitations (email, coalesce(workspace_id, project_id))
  where accepted_at is null and withdrawn_at is null;
create index on public.invitations (email) where accepted_at is null and withdrawn_at is null;

alter table public.invitations enable row level security;
-- Admins der Firma sehen offene Einladungen; ändern nur über die Funktionen unten
create policy invitations_admin_select on public.invitations for select
  using (private.is_org_admin(organization_id));

-- ---------------------------------------------------------------------
-- Einladung anlegen (intern, von den Hinzufügen-Funktionen benutzt)
-- ---------------------------------------------------------------------
create or replace function private.create_invitation(mail text, org uuid, ws uuid, proj uuid, inv_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into invitations (email, organization_id, workspace_id, project_id, role, invited_by)
  values (lower(trim(mail)), org, ws, proj, inv_role, auth.uid())
  on conflict (email, coalesce(workspace_id, project_id)) where accepted_at is null and withdrawn_at is null
  do update set role = excluded.role, invited_by = excluded.invited_by,
                created_at = now(), mailed_at = null, mail_error = null;
  -- Mail gleich verschicken lassen (läuft nach dem Speichern im Hintergrund)
  begin
    perform private.call_notify_function();
  exception when others then
    null; -- dann kommt sie mit dem nächsten Lauf (spätestens 5 Minuten)
  end;
end $$;

-- ---------------------------------------------------------------------
-- Mitglied hinzufügen: unbekannte Adresse → Einladung ('invited')
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
  if position('@' in coalesce(member_email, '')) < 2 then
    raise exception 'Bitte eine gültige E-Mail-Adresse eingeben';
  end if;

  select id into uid from auth.users where lower(email) = lower(trim(member_email));
  if uid is null then
    perform private.create_invitation(member_email, org, ws, null, member_role);
    return 'invited';
  end if;

  insert into organization_members (organization_id, user_id, role)
  values (org, uid, 'member') on conflict do nothing;
  insert into workspace_members (workspace_id, user_id, role)
  values (ws, uid, member_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  return 'added';
end $$;

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
  if position('@' in coalesce(guest_email, '')) < 2 then
    raise exception 'Bitte eine gültige E-Mail-Adresse eingeben';
  end if;

  select id into uid from auth.users where lower(email) = lower(trim(guest_email));
  if uid is null then
    perform private.create_invitation(guest_email, org, null, proj, guest_role);
    return 'invited';
  end if;

  insert into organization_members (organization_id, user_id, role)
  values (org, uid, 'member') on conflict do nothing;
  insert into project_members (project_id, user_id, role, added_by)
  values (proj, uid, guest_role, auth.uid())
  on conflict (project_id, user_id) do update set role = excluded.role;
  return 'added';
end $$;

-- Einladung zurückziehen (Admins der Firma)
create or replace function public.withdraw_invitation(inv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organization_id into org from invitations where id = inv;
  if org is null or not private.is_org_admin(org) then
    raise exception 'Keine Berechtigung';
  end if;
  update invitations set withdrawn_at = now() where id = inv and accepted_at is null;
end $$;

-- Einladung erneut schicken (Admins der Firma)
create or replace function public.resend_invitation(inv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organization_id into org from invitations where id = inv and accepted_at is null and withdrawn_at is null;
  if org is null or not private.is_org_admin(org) then
    raise exception 'Keine Berechtigung';
  end if;
  update invitations set mailed_at = null, mail_error = null, created_at = now() where id = inv;
  begin
    perform private.call_notify_function();
  exception when others then
    null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Annehmen: sobald die Adresse bestätigt ist
-- ---------------------------------------------------------------------
create or replace function private.accept_invitations(uid uuid, mail text)
returns int language plpgsql security definer set search_path = public as $$
declare
  i   record;
  n   int := 0;
begin
  for i in
    select * from invitations
    where email = lower(trim(mail)) and accepted_at is null and withdrawn_at is null
    order by created_at
  loop
    if i.workspace_id is not null and exists (select 1 from workspaces w where w.id = i.workspace_id) then
      insert into organization_members (organization_id, user_id, role)
      values (i.organization_id, uid, 'member') on conflict do nothing;
      insert into workspace_members (workspace_id, user_id, role)
      values (i.workspace_id, uid, i.role)
      on conflict (workspace_id, user_id) do update set role = excluded.role;
      n := n + 1;
    elsif i.project_id is not null and exists (select 1 from projects p where p.id = i.project_id and p.deleted_at is null) then
      insert into organization_members (organization_id, user_id, role)
      values (i.organization_id, uid, 'member') on conflict do nothing;
      insert into project_members (project_id, user_id, role, added_by)
      values (i.project_id, uid, i.role, i.invited_by)
      on conflict (project_id, user_id) do update set role = excluded.role;
      n := n + 1;
    end if;
    update invitations set accepted_at = now(), accepted_by = uid where id = i.id;
  end loop;
  return n;
end $$;

create or replace function private.on_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    begin
      perform private.accept_invitations(new.id, new.email);
    exception when others then
      -- Registrierung nie blockieren; Fehler melden
      perform public.report_error('function', 'Einladung annehmen fehlgeschlagen', sqlerrm, '', '');
    end;
  end if;
  return new;
end $$;

create trigger on_auth_user_invites
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.on_user_confirmed();

-- Für die App: offene Einladungen für mich gleich übernehmen (falls der Auslöser nicht lief)
create or replace function public.accept_my_invitations()
returns int language plpgsql security definer set search_path = public, auth as $$
declare
  mail text;
begin
  if auth.uid() is null then return 0; end if;
  select email into mail from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if mail is null then return 0; end if;
  return private.accept_invitations(auth.uid(), mail);
end $$;

-- ---------------------------------------------------------------------
-- Versand (nur für den Dienst)
-- ---------------------------------------------------------------------
create or replace function public.invitations_pending()
returns table (id uuid, email text, role text, target_name text, org_name text, is_project boolean, inviter_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  return query
    select i.id, i.email, i.role,
           coalesce(w.name, p.name, ''), coalesce(o.name, ''), i.project_id is not null,
           coalesce(nullif(pr.display_name, ''), 'Jemand')
    from invitations i
    left join workspaces w on w.id = i.workspace_id
    left join projects p on p.id = i.project_id
    left join organizations o on o.id = i.organization_id
    left join profiles pr on pr.id = i.invited_by
    where i.mailed_at is null and i.accepted_at is null and i.withdrawn_at is null
      and i.created_at > now() - interval '14 days'
    order by i.created_at
    limit 100;
end $$;

create or replace function public.invitations_mark(ids uuid[], err text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  update invitations set mailed_at = now(), mail_error = err where id = any (ids);
end $$;
