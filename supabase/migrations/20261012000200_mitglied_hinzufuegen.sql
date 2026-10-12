-- =====================================================================
-- Teammitglied per E-Mail zu einem Bereich hinzufügen
--
-- Die Person muss bereits registriert sein. Nur Admins/Owner der
-- Organisation dürfen das. Private Bereiche lassen sich nicht teilen.
-- Rückgabe: 'added' oder 'not_found'
-- =====================================================================

create or replace function public.add_member_by_email(ws uuid, member_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  org      uuid;
  personal boolean;
  uid      uuid;
begin
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
  insert into workspace_members (workspace_id, user_id)
  values (ws, uid) on conflict do nothing;
  return 'added';
end $$;

revoke all on function public.add_member_by_email(uuid, text) from public, anon;
grant execute on function public.add_member_by_email(uuid, text) to authenticated;
