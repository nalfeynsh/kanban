-- 011_done_cleanup.sql
-- Автоочистка блока «Готово»: задачи, пробывшие в нём дольше 3 дней,
-- мягко удаляются (уходят в архив) и могут быть восстановлены.
--
-- Что делает миграция:
--   1. Добавляет tasks.done_at — момент попадания задачи в колонку «Готово».
--   2. Триггер заполняет/сбрасывает done_at при переносе задачи.
--   3. Функция cleanup_done_tasks() архивирует задачи старше 3 дней.
--   4. Если в проекте включён pg_cron — ставит ежедневную проверку в 03:15.
--      Если pg_cron недоступен, очистка всё равно выполнится при входе
--      администратора/менеджера (см. App.jsx).
--
-- Выполнять в Supabase → SQL Editor одним запросом.

alter table public.tasks
  add column if not exists done_at timestamptz;

comment on column public.tasks.done_at is
  'Когда задача попала в колонку «Готово». Нужно для автоочистки (миграция 011).';

create index if not exists tasks_done_at_idx
  on public.tasks (done_at)
  where deleted_at is null;

-- 2. Отметка «в Готово» ставится при переносе и сбрасывается при уходе из колонки.
create or replace function public.tasks_set_done_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_done boolean;
begin
  select exists (
    select 1
    from public.columns c
    where c.id = new.column_id
      and lower(trim(c.title)) in ('готово', 'done')
  ) into is_done;

  if not is_done then
    new.done_at := null;
  elsif tg_op = 'INSERT' then
    new.done_at := coalesce(new.done_at, now());
  elsif new.column_id is distinct from old.column_id then
    new.done_at := now();
  elsif old.deleted_at is not null and new.deleted_at is null then
    -- Вернули задачу из архива: даём ей новые 3 дня в «Готово».
    new.done_at := now();
  end if;

  return new;
end $$;

drop trigger if exists trg_tasks_done_at on public.tasks;
create trigger trg_tasks_done_at
  before insert or update of column_id, deleted_at on public.tasks
  for each row execute function public.tasks_set_done_at();

-- Существующим задачам в «Готово» даём 3 дня с момента миграции,
-- чтобы они не исчезли сразу после включения.
update public.tasks
set done_at = now()
where done_at is null
  and deleted_at is null
  and column_id in (
    select id from public.columns
    where lower(trim(title)) in ('готово', 'done')
  );

-- 3. Архивирование задач, пробывших в «Готово» дольше 3 дней.
create or replace function public.cleanup_done_tasks(retention_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  update public.tasks t
  set deleted_at = now()
  where t.deleted_at is null
    and t.done_at is not null
    and t.done_at < now() - make_interval(days => greatest(retention_days, 1))
    and exists (
      select 1 from public.columns c
      where c.id = t.column_id
        and lower(trim(c.title)) in ('готово', 'done')
    );

  get diagnostics moved = row_count;
  return moved;
end $$;

revoke all on function public.cleanup_done_tasks(integer) from public;
revoke all on function public.cleanup_done_tasks(integer) from anon;
revoke all on function public.cleanup_done_tasks(integer) from authenticated;

-- 4. Ежедневная проверка через pg_cron (если расширение доступно).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise notice 'pg_cron не включён: %', sqlerrm;
    end;

    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'kanban-cleanup-done';

      perform cron.schedule(
        'kanban-cleanup-done',
        '15 3 * * *',
        'select public.cleanup_done_tasks()'
      );
    end if;
  end if;
end $$;
