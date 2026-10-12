-- =====================================================================
-- Sicherheits-Nachbesserung (Hinweise des Supabase Security Advisors)
--
-- 1. Interne Prüffunktionen in ein eigenes Schema "private" verschieben.
--    Dieses Schema ist nicht über die REST-Schnittstelle erreichbar.
--    Die Zugriffsregeln (RLS) verweisen intern auf die Funktion selbst
--    und funktionieren daher unverändert weiter.
-- 2. Fester search_path für die Trigger-Funktionen.
-- 3. Ausführungsrechte auf das Nötige beschränken.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_org_member(uuid)        set schema private;
alter function public.is_org_admin(uuid)         set schema private;
alter function public.can_access_workspace(uuid) set schema private;
alter function public.can_access_project(uuid)   set schema private;
alter function public.can_access_task(uuid)      set schema private;
alter function public.shares_org_with(uuid)      set schema private;

-- Diese zwei rufen andere Prüffunktionen auf: Verweise anpassen
create or replace function private.can_access_project(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    where p.id = proj and private.can_access_workspace(p.workspace_id)
  );
$$;

create or replace function private.can_access_task(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks where id = t and private.can_access_project(project_id)
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

alter function public.set_updated_at()     set search_path = public;
alter function public.tasks_before_write() set search_path = public;

-- Nur über den Registrierungs-Trigger, nie direkt aufrufbar
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Nur für angemeldete Nutzer
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
