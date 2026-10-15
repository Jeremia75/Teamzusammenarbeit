-- Protokolle: Die KI darf ein neues Projekt vorschlagen (z. B. per E-Mail "neues Projekt Sommerfest").
-- Angelegt wird es erst im Prüffenster.

alter table public.protocol_imports add column new_project jsonb;

create or replace function public.protocol_context(uid uuid, proj uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select p.id, p.name, w.name as ws_name, p.workspace_id
    from projects p
    join workspaces w on w.id = p.workspace_id
    where coalesce(auth.role(), '') = 'service_role'
      and p.deleted_at is null and p.archived_at is null
      and (proj is null or p.id = proj)
      and (
        exists (select 1 from organization_members om where om.organization_id = w.organization_id and om.user_id = uid and om.role in ('owner', 'admin'))
        or exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = uid and wm.role = 'editor')
        or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = uid and pm.role = 'editor')
      )
  )
  select jsonb_build_object(
    'user_name', (select coalesce(nullif(display_name, ''), 'Unbenannt') from profiles where id = uid and coalesce(auth.role(), '') = 'service_role'),
    -- Bereiche, in denen die Person neue Projekte anlegen darf
    'bereiche', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'name', case when o.is_personal then w.name else o.name || ' · ' || w.name end,
        'mitglieder', coalesce((
          select jsonb_agg(jsonb_build_object('id', pr.id, 'name', coalesce(nullif(pr.display_name, ''), 'Unbenannt')))
          from profiles pr where pr.id in (select wm2.user_id from workspace_members wm2 where wm2.workspace_id = w.id)
        ), '[]'::jsonb)
      ) order by o.is_personal desc, w.name)
      from workspaces w join organizations o on o.id = w.organization_id
      where coalesce(auth.role(), '') = 'service_role' and (
        exists (select 1 from organization_members om where om.organization_id = w.organization_id and om.user_id = uid and om.role in ('owner', 'admin'))
        or exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = uid and wm.role = 'editor')
      )
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'bereich', m.ws_name,
        'rubriken', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.position) from sections s where s.project_id = m.id), '[]'::jsonb),
        'meilensteine', coalesce((select jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'faellig', ms.due_date) order by ms.position) from milestones ms where ms.project_id = m.id), '[]'::jsonb),
        'mitglieder', coalesce((
          select jsonb_agg(jsonb_build_object('id', pr.id, 'name', coalesce(nullif(pr.display_name, ''), 'Unbenannt')))
          from profiles pr
          where pr.id in (select wm.user_id from workspace_members wm where wm.workspace_id = m.workspace_id
                          union select pm.user_id from project_members pm where pm.project_id = m.id)
        ), '[]'::jsonb),
        'offene_aufgaben', coalesce((
          select jsonb_agg(t.title) from (
            select title from tasks where project_id = m.id and parent_id is null and deleted_at is null and status <> 'done'
            order by position limit 60
          ) t
        ), '[]'::jsonb)
      ) order by m.name)
      from mine m
    ), '[]'::jsonb)
  );
$$;
