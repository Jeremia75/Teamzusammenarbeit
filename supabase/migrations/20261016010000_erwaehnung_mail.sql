-- =====================================================================
-- @Erwähnungen auch per E-Mail
--
-- Wer in einem Kommentar erwähnt wird, bekommt (wenn eingeschaltet) wenige
-- Minuten später eine E-Mail – aber nur, wenn die Mitteilung in der Glocke
-- bis dahin noch ungelesen ist. Wer gerade in Projektraum ist, wird also
-- nicht doppelt benachrichtigt.
-- =====================================================================

alter table public.notification_settings
  add column if not exists on_mention boolean not null default true;

alter table public.notifications
  add column if not exists mailed_at timestamptz;

-- Alles, was schon da ist, gilt als erledigt
update public.notifications set mailed_at = now() where mailed_at is null;

create index if not exists notifications_mention_pending
  on public.notifications (created_at) where kind = 'mention' and mailed_at is null;

-- Ungelesene Erwähnungen, älter als 3 Minuten (nur für den Versand-Dienst)
create or replace function public.notify_pending_mentions()
returns table (id bigint, user_id uuid, task_id uuid, title text, project_id uuid, project_name text,
               actor_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  return query
    select n.id, n.user_id, t.id, t.title, p.id, p.name,
           coalesce(nullif(ap.display_name, ''), 'Jemand'), coalesce(n.body, ''), n.created_at
    from notifications n
    join notification_settings s on s.user_id = n.user_id and s.email_enabled and s.on_mention
    join tasks t on t.id = n.task_id
    join projects p on p.id = t.project_id
    left join profiles ap on ap.id = n.actor_id
    where n.kind = 'mention' and n.mailed_at is null and n.read_at is null
      and n.created_at < now() - interval '3 minutes'
      and n.created_at > now() - interval '2 days'
    order by n.created_at
    limit 200;
end $$;

-- Als verschickt markieren; dazu alles, was nicht (mehr) verschickt werden soll
create or replace function public.notify_mark_mentions(ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Nur für den Versand-Dienst';
  end if;
  update notifications set mailed_at = now() where id = any (ids);
  -- gelesen, zu alt oder Person will keine Mail: nicht mehr anfassen
  update notifications n set mailed_at = now()
  where n.kind = 'mention' and n.mailed_at is null
    and (n.read_at is not null
         or n.created_at < now() - interval '2 days'
         or not exists (select 1 from notification_settings s where s.user_id = n.user_id and s.email_enabled and s.on_mention));
end $$;
