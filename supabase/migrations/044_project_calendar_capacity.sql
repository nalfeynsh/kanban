-- 044_project_calendar_capacity.sql
-- Один производственный календарь на проект, ставки сотрудника/проекта,
-- фактические часы задачи.

create table if not exists public.project_calendars (
  project_id uuid primary key references public.projects(id) on delete cascade,
  year integer not null default extract(year from now())::integer,
  workdays integer[] not null default '{1,2,3,4,5}'::integer[],
  holidays date[] not null default '{}'::date[],
  short_days jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.projects
  add column if not exists default_workday_hours numeric(4,1) not null default 8;
alter table public.profiles
  add column if not exists workday_hours numeric(4,1) not null default 8;
alter table public.project_members
  add column if not exists workday_hours numeric(4,1);
alter table public.tasks
  add column if not exists actual_hours numeric(8,2);

alter table public.project_calendars enable row level security;

drop policy if exists project_calendars_select on public.project_calendars;
create policy project_calendars_select on public.project_calendars
  for select to authenticated
  using (
    exists (select 1 from public.project_members m where m.project_id = project_calendars.project_id and m.profile_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists project_calendars_write on public.project_calendars;
create policy project_calendars_write on public.project_calendars
  for all to authenticated
  using (
    exists (
      select 1 from public.project_members m
      where m.project_id = project_calendars.project_id
        and m.profile_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (
      select 1 from public.project_members m
      where m.project_id = project_calendars.project_id
        and m.profile_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

revoke all on public.project_calendars from authenticated;
grant select, insert, update, delete on public.project_calendars to authenticated;
