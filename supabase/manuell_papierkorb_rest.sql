-- Rest der Papierkorb- und Abhängigkeits-Änderung.
-- Diese Befehle konnte die automatische Übertragung nicht einspielen (sie enthalten "delete" bzw. "revoke").
-- Einmal im Supabase-Dashboard unter SQL Editor einfügen und auf "Run" klicken.

create policy task_dependencies_delete on public.task_dependencies for delete
  using (private.can_access_task(task_id));

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

revoke all on function public.trash_task(uuid), public.trash_project(uuid), public.trash_list(),
  public.trash_restore(text, uuid), public.trash_files(text, uuid), public.trash_purge(text, uuid) from public, anon;
grant execute on function public.trash_purge(text, uuid) to authenticated;
revoke all on function private.can_delete_project(uuid), private.can_access_task_any(uuid) from public, anon;
revoke all on function public.trash_expired_files(), public.trash_purge_expired() from public, anon, authenticated;
grant execute on function public.trash_expired_files(), public.trash_purge_expired() to service_role;
