-- Rest der Änderung "Gäste in einzelnen Projekten".
-- Diese Befehle kann die automatische Übertragung nicht einspielen (sie enthalten "delete" bzw. "revoke").
-- Einmal im Supabase-Dashboard unter SQL Editor einfügen und auf "Run" klicken.

-- Gast aus einem Projekt entfernen (nur Admins der Firma)
create or replace function public.remove_project_guest(proj uuid, guest uuid)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select w.organization_id into org from projects p join workspaces w on w.id = p.workspace_id where p.id = proj;
  if org is null or not private.is_org_admin(org) then
    raise exception 'Freigeben dürfen nur Admins der Firma';
  end if;
  delete from project_members where project_id = proj and user_id = guest;
end $$;

revoke all on function public.add_project_guest(uuid, text, text), public.set_project_guest_role(uuid, uuid, text),
  public.remove_project_guest(uuid, uuid) from public, anon;
grant execute on function public.add_project_guest(uuid, text, text), public.set_project_guest_role(uuid, uuid, text),
  public.remove_project_guest(uuid, uuid) to authenticated;
