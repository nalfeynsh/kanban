-- 056: чтение всех проектов, редактирование — участникам и глобальным руководителям.
-- «Мой Канбан» доступен только для чтения всем, кроме admin/manager/deputy.

create or replace function public.is_main_project(p_project uuid)
returns boolean
language sql
immutable
as $$
  select p_project = '0b6a96c0-6a4b-45fe-97f0-cdf044566c74'::uuid;
$$;

create or replace function public.is_global_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public."current_role"() in ('admin', 'manager', 'deputy'), false);
$$;

create or replace function public.can_read_column(p_column uuid)
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
      and auth.uid() is not null
  );
$$;

create or replace function public.can_edit_column(p_column uuid)
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
      and auth.uid() is not null
      and (
        public.is_global_editor()
        or (
          not public.is_main_project(c.project_id)
          and exists (
            select 1 from public.project_members m
            where m.project_id = c.project_id and m.profile_id = auth.uid()
          )
        )
      )
  );
$$;

-- Для совместимости со старыми вызовами: чтение доступно всем авторизованным.
create or replace function public.can_access_column(p_column uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_read_column(p_column);
$$;

create or replace function public.can_manage_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_editor() or (
    not public.is_main_project(p_project)
    and exists (
      select 1 from public.project_members m
      where m.project_id = p_project
        and m.profile_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
  );
$$;

-- Все авторизованные читают проекты, колонки и участников.
drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
  for select using (
    auth.uid() is not null
    and (
      deleted_at is null
      or public.is_admin()
      or owner_id = auth.uid()
    )
  );

drop policy if exists columns_select_project on public.columns;
create policy columns_select_project on public.columns
  for select using (
    auth.uid() is not null
    and exists (select 1 from public.projects p where p.id = columns.project_id and p.deleted_at is null)
  );

drop policy if exists project_members_select_project on public.project_members;
create policy project_members_select_project on public.project_members
  for select using (
    auth.uid() is not null
    and exists (select 1 from public.projects p where p.id = project_members.project_id and p.deleted_at is null)
  );

-- Создавать проект может любой авторизованный сотрудник.
drop policy if exists projects_insert_managers on public.projects;
create policy projects_insert_managers on public.projects
  for insert with check (owner_id = auth.uid());

-- Задачи: читают все, меняют участники проекта или глобальные руководители.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true and public.can_read_column(column_id))
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (
    created_by = auth.uid()
    and public.can_edit_column(column_id)
    and (is_private is not true or created_by = auth.uid())
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true and public.can_edit_column(column_id))
  ) with check (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true and public.can_edit_column(column_id))
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true and public.can_edit_column(column_id))
  );

grant execute on function public.is_main_project(uuid) to authenticated;
grant execute on function public.is_global_editor() to authenticated;
grant execute on function public.can_read_column(uuid) to authenticated;
grant execute on function public.can_edit_column(uuid) to authenticated;
