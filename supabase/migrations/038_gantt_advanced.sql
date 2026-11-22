-- 038_gantt_advanced.sql
-- Развитие Ганта: методология, story points, вехи, прогресс,
-- базовый план, спринты и зависимости для критического пути.

alter table public.projects
  add column if not exists methodology text not null default 'waterfall';
alter table public.projects
  add column if not exists story_points_enabled boolean not null default false;
alter table public.projects
  add column if not exists resource_capacity integer not null default 1;
alter table public.projects
  add column if not exists baseline_saved_at timestamptz;

alter table public.tasks
  add column if not exists story_points numeric(6,1);
alter table public.tasks
  add column if not exists progress_percent smallint not null default 0;
alter table public.tasks
  add column if not exists is_milestone boolean not null default false;
alter table public.tasks
  add column if not exists baseline_start_at timestamptz;
alter table public.tasks
  add column if not exists baseline_due_at timestamptz;

create table if not exists public.gantt_sprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  start_date date not null,
  end_date date not null,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table public.tasks
  add column if not exists sprint_id uuid references public.gantt_sprints(id) on delete set null;

create index if not exists gantt_sprints_project_idx
  on public.gantt_sprints (project_id, start_date);

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create index if not exists task_dependencies_task_idx
  on public.task_dependencies (task_id);
create index if not exists task_dependencies_parent_idx
  on public.task_dependencies (depends_on_task_id);

alter table public.gantt_sprints enable row level security;
alter table public.task_dependencies enable row level security;

drop policy if exists gantt_sprints_select on public.gantt_sprints;
create policy gantt_sprints_select on public.gantt_sprints
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists gantt_sprints_write on public.gantt_sprints;
create policy gantt_sprints_write on public.gantt_sprints
  for all to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

drop policy if exists task_dependencies_select on public.task_dependencies;
create policy task_dependencies_select on public.task_dependencies
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.can_access_column(t.column_id)
    )
    and exists (
      select 1 from public.tasks t
      where t.id = depends_on_task_id and public.can_access_column(t.column_id)
    )
  );

drop policy if exists task_dependencies_write on public.task_dependencies;
create policy task_dependencies_write on public.task_dependencies
  for all to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.can_access_column(t.column_id)
    )
  )
  with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.can_access_column(t.column_id)
    )
    and exists (
      select 1 from public.tasks t
      where t.id = depends_on_task_id and public.can_access_column(t.column_id)
    )
  );

create or replace function public.gantt_validate_dependency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_parent_project uuid;
begin
  select c.project_id into v_project
  from public.tasks t join public.columns c on c.id = t.column_id
  where t.id = new.task_id;

  select c.project_id into v_parent_project
  from public.tasks t join public.columns c on c.id = t.column_id
  where t.id = new.depends_on_task_id;

  if v_project is null or v_parent_project is null then
    raise exception 'gantt_task_not_found' using errcode = 'P0002';
  end if;
  if v_project <> v_parent_project then
    raise exception 'gantt_cross_project_dependency' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists task_dependencies_validate on public.task_dependencies;
create trigger task_dependencies_validate
  before insert or update on public.task_dependencies
  for each row execute function public.gantt_validate_dependency();

create or replace function public.gantt_validate_task_sprint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_sprint_project uuid;
begin
  if new.sprint_id is null then
    return new;
  end if;
  select c.project_id into v_project
  from public.columns c where c.id = new.column_id;
  select s.project_id into v_sprint_project
  from public.gantt_sprints s where s.id = new.sprint_id;
  if v_project is null or v_sprint_project is null or v_project <> v_sprint_project then
    raise exception 'gantt_sprint_project_mismatch' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists tasks_validate_sprint on public.tasks;
create trigger tasks_validate_sprint
  before insert or update of sprint_id, column_id on public.tasks
  for each row execute function public.gantt_validate_task_sprint();

create or replace function public.gantt_save_baseline(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.can_manage_project(p_project) then
    raise exception 'gantt_manager_required' using errcode = '42501';
  end if;

  update public.tasks t
  set baseline_start_at = t.start_at,
      baseline_due_at = t.due_at
  where t.deleted_at is null
    and exists (
      select 1 from public.columns c
      where c.id = t.column_id and c.project_id = p_project
    );
  get diagnostics v_count = row_count;

  update public.projects
  set baseline_saved_at = now(), updated_at = now()
  where id = p_project;

  return jsonb_build_object('ok', true, 'tasks', v_count);
end $$;

create or replace function public.gantt_clear_baseline(p_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_project(p_project) then
    raise exception 'gantt_manager_required' using errcode = '42501';
  end if;

  update public.tasks t
  set baseline_start_at = null, baseline_due_at = null
  where exists (
    select 1 from public.columns c
    where c.id = t.column_id and c.project_id = p_project
  );

  update public.projects
  set baseline_saved_at = null, updated_at = now()
  where id = p_project;
end $$;

revoke all on function public.gantt_save_baseline(uuid) from public;
revoke all on function public.gantt_clear_baseline(uuid) from public;
grant execute on function public.gantt_save_baseline(uuid) to authenticated;
grant execute on function public.gantt_clear_baseline(uuid) to authenticated;

revoke all on public.gantt_sprints from authenticated;
revoke all on public.task_dependencies from authenticated;
grant select, insert, update, delete on public.gantt_sprints to authenticated;
grant select, insert, update, delete on public.task_dependencies to authenticated;
