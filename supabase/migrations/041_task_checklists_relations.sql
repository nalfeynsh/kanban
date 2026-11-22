-- 041_task_checklists_relations.sql
-- Чек-лист задачи с автоматическим прогрессом и общие связи между задачами.

create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_checklist_items_task_idx
  on public.task_checklist_items (task_id, position);

create table if not exists public.task_relations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  related_task_id uuid not null references public.tasks(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, related_task_id),
  check (task_id <> related_task_id)
);

create index if not exists task_relations_task_idx
  on public.task_relations (task_id);

alter table public.task_checklist_items enable row level security;
alter table public.task_relations enable row level security;

drop policy if exists task_checklist_items_select on public.task_checklist_items;
create policy task_checklist_items_select on public.task_checklist_items
  for select to authenticated
  using (exists (
    select 1 from public.tasks t
    join public.columns c on c.id = t.column_id
    join public.project_members m on m.project_id = c.project_id
    where t.id = task_checklist_items.task_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists task_checklist_items_write on public.task_checklist_items;
create policy task_checklist_items_write on public.task_checklist_items
  for all to authenticated
  using (exists (
    select 1 from public.tasks t
    join public.columns c on c.id = t.column_id
    join public.project_members m on m.project_id = c.project_id
    where t.id = task_checklist_items.task_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.tasks t
    join public.columns c on c.id = t.column_id
    join public.project_members m on m.project_id = c.project_id
    where t.id = task_checklist_items.task_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists task_relations_select on public.task_relations;
create policy task_relations_select on public.task_relations
  for select to authenticated
  using (exists (
    select 1 from public.tasks t
    join public.columns c on c.id = t.column_id
    join public.project_members m on m.project_id = c.project_id
    where t.id = task_relations.task_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists task_relations_write on public.task_relations;
create policy task_relations_write on public.task_relations
  for all to authenticated
  using (exists (
    select 1 from public.tasks t
    join public.columns c on c.id = t.column_id
    join public.project_members m on m.project_id = c.project_id
    where t.id = task_relations.task_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.tasks t
    join public.columns c on c.id = t.column_id
    join public.project_members m on m.project_id = c.project_id
    where t.id = task_relations.task_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

revoke all on public.task_checklist_items from authenticated;
revoke all on public.task_relations from authenticated;
grant select, insert, update, delete on public.task_checklist_items to authenticated;
grant select, insert, update, delete on public.task_relations to authenticated;
