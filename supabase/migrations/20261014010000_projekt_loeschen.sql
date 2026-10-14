-- Projekte löschen: nur wer das Projekt angelegt hat oder Admin der Organisation ist.
-- (Zusätzliche, einschränkende Regel – die bestehenden Regeln bleiben unverändert.)
create policy projects_delete_guard on public.projects
  as restrictive for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.workspaces w where w.id = workspace_id and private.is_org_admin(w.organization_id))
  );
