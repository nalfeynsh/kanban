-- 013_recurring_tasks.sql
-- Повторяющиеся задачи: при завершении задачи создаётся следующая копия.
-- Выполнять в Supabase SQL Editor (или Management API).

alter table public.tasks
  add column if not exists recurrence_freq text,
  add column if not exists recurrence_interval integer not null default 1,
  add column if not exists recurrence_until date,
  add column if not exists recurrence_parent_id uuid references public.tasks(id) on delete set null,
  add column if not exists recurrence_series_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_recurrence_freq_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_recurrence_freq_check
      check (recurrence_freq is null or recurrence_freq in ('daily', 'weekly', 'monthly'));
  end if;
end $$;

-- Одна завершённая задача создаёт ровно одного следующего «ребёнка»
create unique index if not exists tasks_recurrence_parent_key
  on public.tasks (recurrence_parent_id)
  where recurrence_parent_id is not null;

create index if not exists tasks_recurrence_series_idx
  on public.tasks (recurrence_series_id)
  where recurrence_series_id is not null;

create or replace function public.create_next_recurring_task()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  next_due timestamptz;
  next_start timestamptz;
  duration interval;
  step interval;
  target_column uuid;
  next_position integer;
  series uuid;
begin
  -- Только переход «активная → завершённая», не восстановление из архива
  if new.done_at is null or old.done_at is not null then
    return new;
  end if;
  if old.deleted_at is not null or new.deleted_at is not null then
    return new;
  end if;
  if new.recurrence_freq is null or new.due_at is null then
    return new;
  end if;

  -- Защита от повторного создания при повторном завершении/повторном запросе
  if exists (
    select 1 from public.tasks t where t.recurrence_parent_id = new.id
  ) then
    return new;
  end if;

  step := case new.recurrence_freq
    when 'daily' then make_interval(days => greatest(coalesce(new.recurrence_interval, 1), 1))
    when 'weekly' then make_interval(days => 7 * greatest(coalesce(new.recurrence_interval, 1), 1))
    when 'monthly' then make_interval(months => greatest(coalesce(new.recurrence_interval, 1), 1))
    else null
  end;

  if step is null then
    return new;
  end if;

  next_due := new.due_at + step;

  if new.recurrence_until is not null and next_due::date > new.recurrence_until then
    return new;
  end if;

  duration := case
    when new.start_at is not null then new.due_at - new.start_at
    else interval '0'
  end;
  if duration < interval '0' then
    duration := interval '0';
  end if;
  next_start := next_due - duration;
  series := coalesce(new.recurrence_series_id, new.id);

  -- Следующая копия всегда попадает в первую рабочую колонку, а не в «Готово»
  select c.id into target_column
  from public.columns c
  where lower(trim(c.title)) not in ('готово', 'done', 'выполнено')
  order by c.position asc nulls last
  limit 1;

  if target_column is null then
    select c.id into target_column
    from public.columns c
    order by c.position asc nulls last
    limit 1;
  end if;

  if target_column is null then
    return new;
  end if;

  select coalesce(max(t.position), -1) + 1 into next_position
  from public.tasks t
  where t.column_id = target_column and t.deleted_at is null;

  insert into public.tasks (
    title,
    description,
    column_id,
    position,
    created_by,
    is_private,
    due_at,
    start_at,
    priority,
    assignee_id,
    links,
    files,
    date,
    recurrence_freq,
    recurrence_interval,
    recurrence_until,
    recurrence_series_id,
    recurrence_parent_id
  ) values (
    new.title,
    new.description,
    target_column,
    next_position,
    new.created_by,
    new.is_private,
    next_due,
    next_start,
    new.priority,
    new.assignee_id,
    new.links,
    new.files,
    next_due::date,
    new.recurrence_freq,
    greatest(coalesce(new.recurrence_interval, 1), 1),
    new.recurrence_until,
    series,
    new.id
  );

  return new;
exception
  when unique_violation then
    -- Параллельный запрос уже создал следующую копию — не дублируем
    return new;
end $$;

drop trigger if exists trg_tasks_recurrence on public.tasks;
create trigger trg_tasks_recurrence
after update of done_at, column_id on public.tasks
for each row
when (old.done_at is null and new.done_at is not null)
execute function public.create_next_recurring_task();

-- Комментарии для админки
comment on column public.tasks.recurrence_freq is 'daily | weekly | monthly; null — без повторения';
comment on column public.tasks.recurrence_interval is 'Шаг повторения, по умолчанию 1';
comment on column public.tasks.recurrence_until is 'Последняя дата, после которой новые копии не создаются';
comment on column public.tasks.recurrence_parent_id is 'Задача, завершение которой создало эту копию';
comment on column public.tasks.recurrence_series_id is 'Идентификатор серии повторяющихся задач';
