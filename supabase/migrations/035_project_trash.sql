-- 035_project_trash.sql
-- Мягкое удаление проектов: корзина на 30 дней, уведомления, восстановление и очистка.

alter table public.projects
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists purge_at timestamptz;

create index if not exists projects_deleted_idx
  on public.projects (deleted_at, purge_at);

create table if not exists public.project_notices (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid,
  project_name text not null,
  kind text not null default 'project_deleted',
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists project_notices_recipient_idx
  on public.project_notices (recipient_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_notices_project_id_fkey'
      and conrelid = 'public.project_notices'::regclass
  ) then
    alter table public.project_notices
      add constraint project_notices_project_id_fkey
      foreign key (project_id) references public.projects(id)
      on delete cascade;
  end if;
end $$;

alter table public.project_notices enable row level security;

drop policy if exists project_notices_select_own on public.project_notices;
create policy project_notices_select_own
  on public.project_notices for select
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists project_notices_update_own on public.project_notices;
create policy project_notices_update_own
  on public.project_notices for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

grant select, update on public.project_notices to authenticated;

-- Удалённый проект больше не должен отдавать колонки и задачи.
create or replace function public.can_access_column(p_column uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.columns c
    join public.projects p on p.id = c.project_id
    where c.id = p_column
      and p.deleted_at is null
      and (public.is_admin() or exists (
        select 1 from public.project_members m
        where m.project_id = c.project_id and m.profile_id = auth.uid()
      ))
  );
$$;

drop policy if exists columns_select_project on public.columns;
create policy columns_select_project
  on public.columns for select
  to authenticated
  using (
    public.is_project_member(project_id)
    and exists (
      select 1 from public.projects p
      where p.id = columns.project_id and p.deleted_at is null
    )
  );

create or replace function public.project_delete_preview(p_project uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_tasks integer := 0;
  v_archived integer := 0;
  v_columns integer := 0;
  v_members integer := 0;
  v_files integer := 0;
begin
  select * into v_project from public.projects where id = p_project;
  if v_project.id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or public.can_manage_project(p_project)) then
    raise exception 'project_delete_denied' using errcode = '42501';
  end if;

  select
    count(*) filter (where t.deleted_at is null),
    count(*) filter (where t.deleted_at is not null),
    coalesce(sum(
      case
        when jsonb_typeof(t.files) = 'array' then jsonb_array_length(t.files)
        else 0
      end
    ), 0)
  into v_tasks, v_archived, v_files
  from public.tasks t
  join public.columns c on c.id = t.column_id
  where c.project_id = p_project;

  select count(*) into v_columns from public.columns where project_id = p_project;
  select count(*) into v_members from public.project_members where project_id = p_project;

  return jsonb_build_object(
    'id', v_project.id,
    'name', v_project.name,
    'owner_id', v_project.owner_id,
    'tasks', v_tasks,
    'archived_tasks', v_archived,
    'columns', v_columns,
    'members', v_members,
    'files', v_files,
    'deleted_at', v_project.deleted_at,
    'purge_at', v_project.purge_at
  );
end;
$$;

create or replace function public.soft_delete_project(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_preview jsonb;
  v_purge_at timestamptz := now() + interval '30 days';
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_project from public.projects where id = p_project;
  if v_project.id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_project.deleted_at is not null then
    raise exception 'project_already_deleted' using errcode = '22023';
  end if;
  if not (public.is_admin() or public.can_manage_project(p_project)) then
    raise exception 'project_delete_denied' using errcode = '42501';
  end if;

  v_preview := public.project_delete_preview(p_project);

  update public.projects
  set deleted_at = now(),
      deleted_by = auth.uid(),
      purge_at = v_purge_at
  where id = p_project;

  if v_project.owner_id is not null then
    insert into public.project_notices (recipient_id, project_id, project_name, kind, message)
    values (
      v_project.owner_id,
      p_project,
      v_project.name,
      'project_deleted',
      format(
        'Проект «%s» перемещён в корзину. Восстановить можно до %s. После этой даты блоки, задачи и вложенные файлы будут удалены.',
        v_project.name,
        to_char(v_purge_at, 'DD.MM.YYYY HH24:MI')
      )
    );
  end if;

  return v_preview || jsonb_build_object(
    'deleted_at', now(),
    'purge_at', v_purge_at
  );
end;
$$;

create or replace function public.restore_project(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_project from public.projects where id = p_project;
  if v_project.id is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_project.deleted_at is null then
    raise exception 'project_not_deleted' using errcode = '22023';
  end if;
  if v_project.purge_at is not null and v_project.purge_at <= now() then
    raise exception 'project_restore_expired' using errcode = '22023';
  end if;
  if not (public.is_admin() or public.can_manage_project(p_project)) then
    raise exception 'project_restore_denied' using errcode = '42501';
  end if;

  update public.projects
  set deleted_at = null,
      deleted_by = null,
      purge_at = null
  where id = p_project;

  v_owner := v_project.owner_id;
  if v_owner is not null then
    insert into public.project_notices (recipient_id, project_id, project_name, kind, message)
    values (
      v_owner,
      p_project,
      v_project.name,
      'project_restored',
      format('Проект «%s» восстановлен из корзины.', v_project.name)
    );
  end if;

  return jsonb_build_object('id', p_project, 'name', v_project.name, 'restored_at', now());
end;
$$;

create or replace function public.purge_deleted_projects()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    delete from public.projects
    where deleted_at is not null
      and purge_at is not null
      and purge_at <= now()
    returning id
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

grant execute on function public.project_delete_preview(uuid) to authenticated;
grant execute on function public.soft_delete_project(uuid) to authenticated;
grant execute on function public.restore_project(uuid) to authenticated;
grant execute on function public.purge_deleted_projects() to authenticated;

revoke execute on function public.soft_delete_project(uuid) from anon;
revoke execute on function public.restore_project(uuid) from anon;
revoke execute on function public.purge_deleted_projects() from anon;

-- Ежедневная очистка после 30 дней, если доступен pg_cron.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-deleted-projects',
      '20 3 * * *',
      'select public.purge_deleted_projects();'
    );
  end if;
exception
  when undefined_schema or undefined_function then null;
end $$;
