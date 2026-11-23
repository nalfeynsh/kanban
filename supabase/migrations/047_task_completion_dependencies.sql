-- 047_task_completion_and_dependencies.sql
-- Точная скорость: задача сохраняет спринт и дату завершения даже после архивации.
alter table public.tasks
  add column if not exists completed_at timestamptz;
alter table public.tasks
  add column if not exists completed_sprint_id uuid references public.gantt_sprints(id) on delete set null;

create index if not exists tasks_completed_sprint_idx
  on public.tasks (completed_sprint_id, completed_at);

create or replace function public.tasks_track_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done boolean;
begin
  select exists (
    select 1 from public.columns c
    where c.id = new.column_id
      and lower(btrim(c.title)) in ('готово', 'done')
  ) into v_done;

  if v_done then
    if new.completed_at is null then
      new.completed_at := coalesce(new.done_at, now());
    end if;
    if new.sprint_id is not null then
      new.completed_sprint_id := new.sprint_id;
    end if;
  else
    new.completed_at := null;
    new.completed_sprint_id := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_track_completion on public.tasks;
create trigger tasks_track_completion
  before insert or update of column_id, sprint_id on public.tasks
  for each row execute function public.tasks_track_completion();

-- Задачи, уже находящиеся в «Готово», получают историческую точку.
update public.tasks t
set completed_at = coalesce(t.done_at, t.updated_at, t.created_at, now()),
    completed_sprint_id = t.sprint_id
from public.columns c
where c.id = t.column_id
  and lower(btrim(c.title)) in ('готово', 'done')
  and t.completed_at is null;

-- Типы зависимостей: FS (finish-to-start), SS, FF, SF.
alter table public.task_dependencies
  add column if not exists relation_type text not null default 'FS';
alter table public.task_dependencies
  add column if not exists lag_days integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'task_dependencies_relation_type_check'
  ) then
    alter table public.task_dependencies
      add constraint task_dependencies_relation_type_check
      check (relation_type in ('FS', 'SS', 'FF', 'SF'));
  end if;
end $$;
