-- Rest von Rollen und Verlauf (live per supabase/manuell_rollen_verlauf.sql eingespielt)


-- 1) Löschen nur mit Bearbeiten-Recht (Rolle "Bearbeiten" oder Admin)
create policy goals_edit_del on public.goals as restrictive for delete to authenticated
  using (private.can_edit_project(project_id));
create policy milestones_edit_del on public.milestones as restrictive for delete to authenticated
  using (private.can_edit_project(project_id));
create policy sections_edit_del on public.sections as restrictive for delete to authenticated
  using (private.can_edit_project(project_id));
create policy tasks_edit_del on public.tasks as restrictive for delete to authenticated
  using (private.can_edit_project(project_id));
create policy project_sections_edit_del on public.project_sections as restrictive for delete to authenticated
  using (private.can_edit_workspace(workspace_id));
create policy projects_edit_del on public.projects as restrictive for delete to authenticated
  using (private.can_edit_workspace(workspace_id));
create policy assignees_edit_del on public.task_assignees as restrictive for delete to authenticated
  using (private.can_edit_task(task_id));
create policy task_attachments_edit_del on public.task_attachments as restrictive for delete to authenticated
  using (private.can_edit_task(task_id));
create policy task_dependencies_edit_del on public.task_dependencies as restrictive for delete to authenticated
  using (private.can_edit_task(task_id));
do $outer$
begin
  if to_regclass('storage.objects') is not null then
    execute $p$
      create policy anhaenge_edit_del on storage.objects as restrictive for delete to authenticated
        using (bucket_id <> 'anhaenge' or private.can_edit_task(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;
end
$outer$;

-- 2) Endgültig löschen im Papierkorb nur mit Bearbeiten-Recht
create or replace function public.trash_purge(k text, item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if k = 'task' then
    if not exists (select 1 from tasks where id = item and deleted_at is not null) or not private.can_edit_task(item) then
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

-- 3) Verlauf: Verantwortliche, Anhänge und Abhängigkeiten entfernt
--    (nicht, wenn die ganze Aufgabe endgültig gelöscht wird)
create or replace function private.history_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tasks where id = old.task_id) then
    return old;
  end if;
  if tg_table_name = 'task_assignees' then
    perform private.log_task(old.task_id, 'assignee_removed', null,
      coalesce((select nullif(display_name, '') from profiles where id = old.user_id), 'Unbenannt'));
  elsif tg_table_name = 'task_attachments' then
    perform private.log_task(old.task_id, 'attachment_removed', old.kind, old.name);
  elsif tg_table_name = 'task_dependencies' then
    perform private.log_task(old.task_id, 'dependency_removed', null, (select title from tasks where id = old.depends_on));
  end if;
  return old;
end $$;
create trigger task_assignees_history_del after delete on public.task_assignees
  for each row execute function private.history_removed();
create trigger task_attachments_history_del after delete on public.task_attachments
  for each row execute function private.history_removed();
create trigger task_dependencies_history_del after delete on public.task_dependencies
  for each row execute function private.history_removed();

-- 4) Neue Funktionen nicht für Abgemeldete
revoke all on function public.add_member_by_email(uuid, text, text), public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.add_member_by_email(uuid, text, text), public.set_member_role(uuid, uuid, text) to authenticated;
revoke all on function private.log_task(uuid, text, text, text, boolean) from public, anon, authenticated;
