-- =====================================================================
-- „Feedback geben“: Rückmeldungen aus der App werden Aufgaben im Projekt
-- app_settings."intern.feedback_project", zugeteilt an
-- app_settings."intern.feedback_assignee" (beide für Nutzer unsichtbar).
-- =====================================================================

insert into public.app_settings (key, value) values
  ('intern.feedback_project', 'f5a5979c-4be6-409b-9094-80ca3c2cb3a7'),
  ('intern.feedback_assignee', '2e855c50-3b76-45a5-9e12-a8f4b77a59ae')
on conflict (key) do update set value = excluded.value;

create or replace function public.send_feedback(body text, page text default '', agent text default '')
returns text language plpgsql security definer set search_path = public, auth as $$
declare
  proj    uuid;
  who     uuid;
  me      uuid := auth.uid();
  mail    text;
  nm      text;
  txt     text := trim(coalesce(body, ''));
  t_id    uuid;
  pos     double precision;
  recent  int;
begin
  if me is null then
    raise exception 'Bitte zuerst anmelden';
  end if;
  if char_length(txt) < 3 then
    raise exception 'Bitte schreib ein paar Worte';
  end if;
  txt := left(txt, 5000);

  -- Schutz vor Überflutung: höchstens 20 Rückmeldungen pro Person und Stunde
  select count(*) into recent from tasks
  where created_by = me and created_at > now() - interval '1 hour'
    and project_id = (select value::uuid from app_settings where key = 'intern.feedback_project');
  if recent >= 20 then
    raise exception 'Danke! Du hast gerade schon viele Rückmeldungen geschickt. Bitte später wieder.';
  end if;

  select value::uuid into proj from app_settings where key = 'intern.feedback_project';
  select value::uuid into who from app_settings where key = 'intern.feedback_assignee';
  if proj is null then
    raise exception 'Rückmeldungen sind gerade nicht eingerichtet';
  end if;

  select email into mail from auth.users where id = me;
  select coalesce(nullif(display_name, ''), split_part(mail, '@', 1)) into nm from profiles where id = me;
  select coalesce(max(position), 0) + 1 into pos from tasks where project_id = proj and parent_id is null;

  insert into tasks (project_id, title, description, position, created_by, priority)
  values (
    proj,
    left(regexp_replace(split_part(txt, E'\n', 1), '\s+', ' ', 'g'), 90),
    txt || E'\n\n—\nVon: ' || coalesce(nm, '?') || ' (' || coalesce(mail, '?') || ')'
        || E'\nSeite: ' || left(coalesce(nullif(page, ''), '?'), 300)
        || E'\nGerät: ' || left(coalesce(nullif(agent, ''), '?'), 300),
    pos, me, 'medium'
  )
  returning id into t_id;

  if who is not null then
    insert into task_assignees (task_id, user_id) values (t_id, who) on conflict do nothing;
  end if;
  return t_id::text;
end $$;
