-- 039_gantt_hours_baselines.sql
-- Уточнение Ганта: человеко-часы, несколько базовых планов,
-- отдельная дата вехи, задержка зависимостей и параметры Scrum-спринта.

alter table public.projects
  add column if not exists daily_hours numeric(4,1) default 8;
alter table public.projects
  add column if not exists scrum_enabled boolean default false;

alter table public.tasks
  add column if not exists effort_hours numeric(8,2);
alter table public.tasks
  add column if not exists milestone_date date;
alter table public.tasks
  add column if not exists dependency_lag_days integer default 0;

alter table public.gantt_sprints
  add column if not exists goal text;
alter table public.gantt_sprints
  add column if not exists capacity_hours numeric(8,2) default 0;

create table if not exists public.gantt_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.gantt_baseline_tasks (
  baseline_id uuid not null references public.gantt_baselines(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  start_at timestamptz,
  due_at timestamptz,
  primary key (baseline_id, task_id)
);

create index if not exists gantt_baselines_project_idx
  on public.gantt_baselines (project_id, created_at desc);

alter table public.gantt_baselines enable row level security;
alter table public.gantt_baseline_tasks enable row level security;

drop policy if exists gantt_baselines_select on public.gantt_baselines;
create policy gantt_baselines_select on public.gantt_baselines
  for select to authenticated
  using (exists (
    select 1 from public.project_members m
    where m.project_id = gantt_baselines.project_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists gantt_baselines_write on public.gantt_baselines;
create policy gantt_baselines_write on public.gantt_baselines
  for all to authenticated
  using (
    exists (
      select 1 from public.project_members m
      where m.project_id = gantt_baselines.project_id
        and m.profile_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (
      select 1 from public.project_members m
      where m.project_id = gantt_baselines.project_id
        and m.profile_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists gantt_baseline_tasks_select on public.gantt_baseline_tasks;
create policy gantt_baseline_tasks_select on public.gantt_baseline_tasks
  for select to authenticated
  using (exists (
    select 1
    from public.gantt_baselines b
    join public.project_members m on m.project_id = b.project_id
    where b.id = gantt_baseline_tasks.baseline_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists gantt_baseline_tasks_write on public.gantt_baseline_tasks;
create policy gantt_baseline_tasks_write on public.gantt_baseline_tasks
  for all to authenticated
  using (exists (
    select 1
    from public.gantt_baselines b
    join public.project_members m on m.project_id = b.project_id
    where b.id = gantt_baseline_tasks.baseline_id
      and m.profile_id = auth.uid()
      and m.role in ('owner', 'manager')
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1
    from public.gantt_baselines b
    join public.project_members m on m.project_id = b.project_id
    where b.id = gantt_baseline_tasks.baseline_id
      and m.profile_id = auth.uid()
      and m.role in ('owner', 'manager')
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

revoke all on public.gantt_baselines from authenticated;
revoke all on public.gantt_baseline_tasks from authenticated;
grant select, insert, update, delete on public.gantt_baselines to authenticated;
grant select, insert, update, delete on public.gantt_baseline_tasks to authenticated;
