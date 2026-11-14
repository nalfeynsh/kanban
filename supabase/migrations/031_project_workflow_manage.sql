-- 031_project_workflow_manage.sql
-- Управление этапами проекта после создания: добавить, переименовать, удалить.
-- При удалении блока его активные задачи уходят в архив и переносятся в «Сделать».
-- Архивные задачи этого блока тоже получают «Сделать», чтобы восстановление работало.

create or replace function public.save_project_column(
  p_project_id uuid,
  p_column_id uuid default null,
  p_title text default null,
  p_responsible_id uuid default null
)
returns public.columns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.columns;
  v_position integer;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'project_column_denied' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'column_title_required' using errcode = '22023';
  end if;

  if length(btrim(p_title)) > 80 then
    raise exception 'column_title_too_long' using errcode = '22023';
  end if;

  if p_column_id is null then
    select coalesce(max(position), 0) + 1 into v_position
    from public.columns where project_id = p_project_id;

    if (select count(*) from public.columns where project_id = p_project_id) >= 20 then
      raise exception 'too_many_project_columns' using errcode = '22023';
    end if;

    insert into public.columns (project_id, title, position, responsible_id)
    values (p_project_id, btrim(p_title), v_position, p_responsible_id)
    returning * into v_row;
  else
    update public.columns
    set title = btrim(p_title),
        responsible_id = p_responsible_id
    where id = p_column_id and project_id = p_project_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'column_not_found' using errcode = 'P0002';
    end if;
  end if;

  return v_row;
end $$;

create or replace function public.delete_project_column(p_column_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_column public.columns;
  v_fallback public.columns;
  v_active_count integer := 0;
  v_archived_count integer := 0;
begin
  select * into v_column from public.columns where id = p_column_id;
  if v_column.id is null then
    raise exception 'column_not_found' using errcode = 'P0002';
  end if;

  if not public.can_manage_project(v_column.project_id) then
    raise exception 'project_column_denied' using errcode = '42501';
  end if;

  select * into v_fallback
  from public.columns
  where project_id = v_column.project_id
    and id <> v_column.id
  order by
    case when title ~* '^(сделать|к выполнению|todo|to do|бэклог|backlog)$' then 0 else 1 end,
    position
  limit 1;

  if v_fallback.id is null then
    raise exception 'cannot_delete_last_column' using errcode = '22023';
  end if;

  select count(*) into v_active_count
  from public.tasks
  where column_id = v_column.id and deleted_at is null;

  select count(*) into v_archived_count
  from public.tasks
  where column_id = v_column.id and deleted_at is not null;

  -- Активные задачи: в архив, с сохранением возможности восстановить в «Сделать».
  update public.tasks
  set column_id = v_fallback.id,
      deleted_at = now(),
      deleted_by = auth.uid()
  where column_id = v_column.id and deleted_at is null;

  -- Уже архивные задачи: переносим на «Сделать», чтобы FK не удалил их каскадом.
  update public.tasks
  set column_id = v_fallback.id
  where column_id = v_column.id and deleted_at is not null;

  delete from public.columns where id = v_column.id;

  return jsonb_build_object(
    'archived', v_active_count,
    'moved_archived', v_archived_count,
    'fallback_id', v_fallback.id,
    'fallback_title', v_fallback.title
  );
end $$;

revoke all on function public.save_project_column(uuid, uuid, text, uuid) from public;
revoke all on function public.delete_project_column(uuid) from public;
grant execute on function public.save_project_column(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.delete_project_column(uuid) to authenticated;

comment on function public.delete_project_column(uuid) is
  'Удаляет этап; активные задачи архивируются и переносятся в первый этап проекта.';
