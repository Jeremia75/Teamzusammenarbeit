-- =====================================================================
-- Rubriken für Projekte innerhalb eines Bereichs (Projekt-Board)
-- =====================================================================

create table public.project_sections (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  position     double precision not null default 0,
  created_at   timestamptz not null default now()
);
create index on public.project_sections (workspace_id, position);

alter table public.project_sections enable row level security;
create policy project_sections_all on public.project_sections for all
  using (private.can_access_workspace(workspace_id))
  with check (private.can_access_workspace(workspace_id));

alter table public.projects
  add column section_id uuid references public.project_sections (id) on delete set null,
  add column position double precision not null default 0;
create index on public.projects (workspace_id, section_id, position);

-- Bestehende Projekte alphabetisch durchnummerieren
update public.projects p set position = r.rn
from (select id, row_number() over (partition by workspace_id order by name) as rn from public.projects) r
where r.id = p.id;

-- Rubrik muss zum Bereich des Projekts gehören; wechselt ein Projekt den
-- Bereich, verliert es seine Rubrik (statt eines Fehlers).
create or replace function public.projects_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.section_id is not null and not exists (
    select 1 from public.project_sections s
    where s.id = new.section_id and s.workspace_id = new.workspace_id
  ) then
    if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
      new.section_id := null;
    else
      raise exception 'Rubrik gehört zu einem anderen Bereich';
    end if;
  end if;
  return new;
end $$;

create trigger projects_before_write before insert or update on public.projects
  for each row execute function public.projects_before_write();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.project_sections;
  end if;
end $$;
