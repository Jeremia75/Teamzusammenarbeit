-- Abhängigkeiten zwischen Aufgaben: "task_id wartet auf depends_on" (Ende → Beginn).

create table public.task_dependencies (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  depends_on  uuid not null references public.tasks (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);
create index on public.task_dependencies (project_id);
create index on public.task_dependencies (depends_on);

alter table public.task_dependencies enable row level security;
create policy task_dependencies_select on public.task_dependencies for select
  using (private.can_access_task(task_id));
create policy task_dependencies_insert on public.task_dependencies for insert
  with check (private.can_access_task(task_id) and private.can_access_task(depends_on));
create policy task_dependencies_delete on public.task_dependencies for delete
  using (private.can_access_task(task_id));

-- Gleiches Projekt, keine Kreise (A wartet auf B, B wartet auf A …)
create or replace function private.dependencies_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare p1 uuid; p2 uuid;
begin
  select project_id into p1 from tasks where id = new.task_id;
  select project_id into p2 from tasks where id = new.depends_on;
  if p1 is null or p2 is null or p1 <> p2 then
    raise exception 'Abhängigkeiten gehen nur innerhalb eines Projekts';
  end if;
  new.project_id := p1;
  if exists (
    with recursive chain(id) as (
      select d.depends_on from task_dependencies d where d.task_id = new.depends_on
      union
      select d.depends_on from task_dependencies d join chain c on d.task_id = c.id
    )
    select 1 from chain where id = new.task_id
  ) then
    raise exception 'Das ergäbe einen Kreis: Die Aufgabe wartet schon (über Umwege) auf diese hier';
  end if;
  return new;
end $$;
create trigger task_dependencies_before_insert before insert on public.task_dependencies
  for each row execute function private.dependencies_before_insert();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.task_dependencies;
  end if;
end $$;
