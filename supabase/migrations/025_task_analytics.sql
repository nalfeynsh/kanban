-- 025_task_analytics.sql
-- История перемещений задач между колонками для аналитики.
-- Создание/перемещение фиксируется триггером; чтение — только роли аналитики.

create table if not exists public.task_status_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'moved')),
  from_column_id uuid references public.columns(id) on delete set null,
  to_column_id uuid references public.columns(id) on delete set null,
  from_title text,
  to_title text,
  moved_by uuid references public.profiles(id) on delete set null,
  moved_at timestamptz not null default now()
);

create index if not exists task_status_events_task_idx
  on public.task_status_events (task_id, moved_at desc);
create index if not exists task_status_events_moved_idx
  on public.task_status_events (moved_at desc);

alter table public.task_status_events enable row level security;

drop policy if exists task_status_events_select_analytics on public.task_status_events;
create policy task_status_events_select_analytics on public.task_status_events
  for select to authenticated
  using (public.current_role() in ('admin', 'manager', 'deputy'));

grant select on public.task_status_events to authenticated;

create or replace function public.log_task_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_title text;
  v_to_title text;
begin
  select title into v_to_title from public.columns where id = new.column_id;

  if tg_op = 'INSERT' then
    insert into public.task_status_events (
      task_id, event_type, from_column_id, to_column_id, from_title, to_title, moved_by, moved_at
    ) values (
      new.id, 'created', null, new.column_id, null, v_to_title,
      coalesce(auth.uid(), new.created_by), coalesce(new.created_at, now())
    );
    return new;
  end if;

  if new.column_id is distinct from old.column_id then
    select title into v_from_title from public.columns where id = old.column_id;
    insert into public.task_status_events (
      task_id, event_type, from_column_id, to_column_id, from_title, to_title, moved_by
    ) values (
      new.id, 'moved', old.column_id, new.column_id, v_from_title, v_to_title,
      coalesce(auth.uid(), new.created_by)
    );
  end if;

  return new;
end $$;

drop trigger if exists trg_task_status_event_insert on public.tasks;
create trigger trg_task_status_event_insert
  after insert on public.tasks
  for each row execute function public.log_task_status_event();

drop trigger if exists trg_task_status_event_move on public.tasks;
create trigger trg_task_status_event_move
  after update of column_id on public.tasks
  for each row execute function public.log_task_status_event();

comment on table public.task_status_events is
  'История создания и перемещений задач между колонками для аналитики.';
