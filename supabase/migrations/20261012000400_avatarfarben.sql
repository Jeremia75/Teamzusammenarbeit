-- =====================================================================
-- Jede Person bekommt bei der Registrierung eine eigene Avatar-Farbe,
-- damit Zuständige auf den Karten unterscheidbar sind.
-- =====================================================================

create or replace function private.avatar_color_for(uid uuid)
returns text language sql immutable as $$
  select (array['#1F5FBF', '#0E7C66', '#6B4FB3', '#B4561C', '#8A6A12', '#B0336B'])
         [1 + abs(hashtext(uid::text)) % 6];
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  ws_id  uuid;
begin
  insert into profiles (id, display_name, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    -- reihum vergeben, damit nacheinander registrierte Personen sich unterscheiden
    (array['#1F5FBF', '#0E7C66', '#6B4FB3', '#B4561C', '#8A6A12', '#B0336B'])
      [1 + (select count(*) from profiles)::int % 6]
  );

  insert into organizations (name, is_personal, created_by)
  values ('Privat', true, new.id) returning id into org_id;
  insert into organization_members (organization_id, user_id, role) values (org_id, new.id, 'owner');
  insert into workspaces (organization_id, name, color)
  values (org_id, 'Privat', '#B4561C') returning id into ws_id;
  insert into workspace_members (workspace_id, user_id) values (ws_id, new.id);
  return new;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Bestehende Profile mit der Standardfarbe nachträglich einfärben
update public.profiles set avatar_color = private.avatar_color_for(id) where avatar_color = '#1F5FBF';

alter function private.avatar_color_for(uuid) set search_path = public;
