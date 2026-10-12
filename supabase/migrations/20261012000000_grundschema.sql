-- =====================================================================
-- Projektraum – Grundschema
--
-- Ebenen:
--   Organisation (zahlender Kunde / Mandant; jeder Nutzer hat zusätzlich
--                 eine eigene "Privat"-Organisation)
--   └─ Bereich (workspace)          – z. B. "Beruflich", "Privat"
--       └─ Projekt
--           ├─ Ziele & Meilensteine
--           └─ Aufgaben (beliebig tief verschachtelt = Unteraufgaben)
--
-- Sicherheit: Jede Tabelle hat Row Level Security. Wer keinen Zugriff
-- auf einen Bereich hat, sieht dessen Daten nicht – auch nicht bei einem
-- Fehler im Frontend.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Aufzählungstypen
-- ---------------------------------------------------------------------
create type public.org_role      as enum ('owner', 'admin', 'member');
create type public.task_status   as enum ('todo', 'doing', 'review', 'done');
create type public.task_priority as enum ('low', 'medium', 'high');

-- ---------------------------------------------------------------------
-- Hilfsfunktion: updated_at automatisch setzen
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Profile (öffentliche Nutzerdaten zu auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_color text not null default '#1F5FBF',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Organisationen = Mandanten
-- ---------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  is_personal boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            public.org_role not null default 'member',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index on public.organization_members (user_id);

-- ---------------------------------------------------------------------
-- Bereiche (Workspaces) innerhalb einer Organisation
-- ---------------------------------------------------------------------
create table public.workspaces (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  color           text not null default '#1F5FBF',
  created_at      timestamptz not null default now()
);
create index on public.workspaces (organization_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

-- ---------------------------------------------------------------------
-- Projekte
-- ---------------------------------------------------------------------
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  description  text not null default '',
  color        text not null default '#1F5FBF',
  archived_at  timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.projects (workspace_id);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Ziele und Meilensteine
-- ---------------------------------------------------------------------
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  target_date date,
  created_at  timestamptz not null default now()
);
create index on public.goals (project_id);

create table public.milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  goal_id    uuid references public.goals (id) on delete set null,
  name       text not null check (char_length(name) between 1 and 200),
  due_date   date,
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index on public.milestones (project_id);

-- ---------------------------------------------------------------------
-- Aufgaben (parent_id gesetzt = Unteraufgabe)
-- ---------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  parent_id    uuid references public.tasks (id) on delete cascade,
  milestone_id uuid references public.milestones (id) on delete set null,
  title        text not null check (char_length(title) between 1 and 500),
  description  text not null default '',
  status       public.task_status not null default 'todo',
  priority     public.task_priority not null default 'medium',
  due_date     date,
  position     double precision not null default 0,
  completed_at timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index on public.tasks (project_id, status, position);
create index on public.tasks (parent_id);
create index on public.tasks (milestone_id);

-- Unteraufgaben und Meilensteine müssen zum selben Projekt gehören;
-- completed_at folgt dem Status.
create or replace function public.tasks_before_write()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.tasks p
    where p.id = new.parent_id and p.project_id = new.project_id
  ) then
    raise exception 'Unteraufgabe muss im selben Projekt liegen wie die übergeordnete Aufgabe';
  end if;

  if new.milestone_id is not null and not exists (
    select 1 from public.milestones m
    where m.id = new.milestone_id and m.project_id = new.project_id
  ) then
    raise exception 'Meilenstein gehört zu einem anderen Projekt';
  end if;

  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

create table public.task_assignees (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index on public.task_assignees (user_id);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index on public.comments (task_id, created_at);

-- =====================================================================
-- Zugriffsprüfungen (security definer, damit RLS nicht rekursiv wird)
-- =====================================================================
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members
    where organization_id = org and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members
    where organization_id = org and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- Zugriff auf einen Bereich: Mitglied des Bereichs ODER Admin der Organisation
create or replace function public.can_access_workspace(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws and user_id = auth.uid()
  ) or exists (
    select 1 from workspaces w
    join organization_members om on om.organization_id = w.organization_id
    where w.id = ws and om.user_id = auth.uid() and om.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_access_project(proj uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    where p.id = proj and public.can_access_workspace(p.workspace_id)
  );
$$;

create or replace function public.can_access_task(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks where id = t and public.can_access_project(project_id)
  );
$$;

-- Teilen zwei Nutzer eine Organisation? (für Profilsichtbarkeit)
create or replace function public.shares_org_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members a
    join organization_members b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles             enable row level security;
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.workspaces           enable row level security;
alter table public.workspace_members    enable row level security;
alter table public.projects             enable row level security;
alter table public.goals                enable row level security;
alter table public.milestones           enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_assignees       enable row level security;
alter table public.comments             enable row level security;

-- Profile: eigenes + von Leuten aus gemeinsamen Organisationen lesen
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.shares_org_with(id));
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Organisationen: Anlegen nur über create_organization()
create policy orgs_select on public.organizations for select
  using (public.is_org_member(id));
create policy orgs_update on public.organizations for update
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));
create policy orgs_delete on public.organizations for delete
  using (exists (select 1 from public.organization_members
                 where organization_id = id and user_id = auth.uid() and role = 'owner'));

create policy org_members_select on public.organization_members for select
  using (public.is_org_member(organization_id));
create policy org_members_insert on public.organization_members for insert
  with check (public.is_org_admin(organization_id) and role <> 'owner');
create policy org_members_update on public.organization_members for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id) and role <> 'owner');
create policy org_members_delete on public.organization_members for delete
  using ((public.is_org_admin(organization_id) and role <> 'owner')
         or (user_id = auth.uid() and role <> 'owner'));

-- Bereiche
create policy ws_select on public.workspaces for select
  using (public.can_access_workspace(id));
create policy ws_insert on public.workspaces for insert
  with check (public.is_org_admin(organization_id));
create policy ws_update on public.workspaces for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy ws_delete on public.workspaces for delete
  using (public.is_org_admin(organization_id));

create policy ws_members_select on public.workspace_members for select
  using (public.can_access_workspace(workspace_id));
create policy ws_members_insert on public.workspace_members for insert
  with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.is_org_admin(w.organization_id))
    and exists (select 1 from public.workspaces w
                join public.organization_members om on om.organization_id = w.organization_id
                where w.id = workspace_id and om.user_id = workspace_members.user_id)
  );
create policy ws_members_delete on public.workspace_members for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from public.workspaces w
               where w.id = workspace_id and public.is_org_admin(w.organization_id))
  );

-- Projekte und alles darunter: wer den Bereich sieht, darf mitarbeiten
create policy projects_all on public.projects for all
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy goals_all on public.goals for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy milestones_all on public.milestones for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy tasks_all on public.tasks for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy assignees_all on public.task_assignees for all
  using (public.can_access_task(task_id))
  with check (
    public.can_access_task(task_id)
    and exists (
      select 1 from public.tasks t
      join public.projects p on p.id = t.project_id
      join public.workspaces w on w.id = p.workspace_id
      join public.organization_members om on om.organization_id = w.organization_id
      where t.id = task_id and om.user_id = task_assignees.user_id
    )
  );

create policy comments_select on public.comments for select
  using (public.can_access_task(task_id));
create policy comments_insert on public.comments for insert
  with check (author_id = auth.uid() and public.can_access_task(task_id));
create policy comments_update on public.comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on public.comments for delete
  using (author_id = auth.uid());

-- =====================================================================
-- Funktionen für das Frontend
-- =====================================================================

-- Neue Organisation inkl. Eigentümer-Mitgliedschaft und erstem Bereich
create or replace function public.create_organization(org_name text, first_workspace text default 'Allgemein')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  org_id uuid;
  ws_id  uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet';
  end if;

  insert into organizations (name, created_by) values (org_name, uid) returning id into org_id;
  insert into organization_members (organization_id, user_id, role) values (org_id, uid, 'owner');
  insert into workspaces (organization_id, name) values (org_id, first_workspace) returning id into ws_id;
  insert into workspace_members (workspace_id, user_id) values (ws_id, uid);
  return org_id;
end $$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

-- Bei Registrierung: Profil + private Organisation mit Bereich "Privat"
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  ws_id  uuid;
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into organizations (name, is_personal, created_by)
  values ('Privat', true, new.id) returning id into org_id;
  insert into organization_members (organization_id, user_id, role) values (org_id, new.id, 'owner');
  insert into workspaces (organization_id, name, color)
  values (org_id, 'Privat', '#B4561C') returning id into ws_id;
  insert into workspace_members (workspace_id, user_id) values (ws_id, new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Echtzeit-Updates für Board und Details (nur wenn Supabase Realtime da ist)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.projects, public.milestones, public.tasks, public.task_assignees, public.comments;
  end if;
end $$;
