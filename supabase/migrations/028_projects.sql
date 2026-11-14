-- 028_projects.sql
-- Проекты: отдельные доски, рабочие группы, ответственные за этапы.
-- Существующая доска становится проектом «Мой Канбан»; колонки получают project_id.

begin;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'manager', 'member')),
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create index if not exists project_members_profile_idx
  on public.project_members (profile_id);
create index if not exists projects_owner_idx
  on public.projects (owner_id);

alter table public.columns
  add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.columns
  add column if not exists responsible_id uuid references public.profiles(id) on delete set null;

-- Существующие колонки и задачи — в основной проект.
do $$
declare
  v_project uuid;
  v_owner uuid;
begin
  select id into v_project from public.projects where name = 'Мой Канбан' order by created_at limit 1;

  if v_project is null then
    select id into v_owner from public.profiles where role = 'admin' order by created_at limit 1;
    insert into public.projects (name, description, owner_id)
    values ('Мой Канбан', 'Основная доска команды', v_owner)
    returning id into v_project;
  end if;

  update public.columns set project_id = v_project where project_id is null;

  insert into public.project_members (project_id, profile_id, role)
  select v_project, p.id,
         case when p.id = (select owner_id from public.projects where id = v_project) then 'owner' else 'member' end
  from public.profiles p
  on conflict (project_id, profile_id) do nothing;

  update public.projects set owner_id = coalesce(owner_id, v_owner) where id = v_project;
end $$;

alter table public.columns alter column project_id set not null;

create index if not exists columns_project_position_idx
  on public.columns (project_id, position);

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

-- ------------------------------------------------------------
-- Помощники доступа
-- ------------------------------------------------------------
create or replace function public.is_project_member(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.profile_id = auth.uid()
  );
$$;

create or replace function public.can_manage_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.project_members m
    where m.project_id = p_project
      and m.profile_id = auth.uid()
      and m.role in ('owner', 'manager')
  );
$$;

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
    where c.id = p_column
      and (public.is_admin() or exists (
        select 1 from public.project_members m
        where m.project_id = c.project_id and m.profile_id = auth.uid()
      ))
  );
$$;

grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;
grant execute on function public.can_access_column(uuid) to authenticated;

revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.can_manage_project(uuid) from public;
revoke all on function public.can_access_column(uuid) from public;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;
grant execute on function public.can_access_column(uuid) to authenticated;

-- ------------------------------------------------------------
-- RLS проектов и участников
-- ------------------------------------------------------------
drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
  for select to authenticated
  using (public.is_project_member(id));

drop policy if exists projects_insert_managers on public.projects;
create policy projects_insert_managers on public.projects
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.current_role() in ('admin', 'manager', 'deputy')
  );

drop policy if exists projects_update_owner on public.projects;
create policy projects_update_owner on public.projects
  for update to authenticated
  using (public.can_manage_project(id))
  with check (public.can_manage_project(id));

drop policy if exists projects_delete_owner on public.projects;
create policy projects_delete_owner on public.projects
  for delete to authenticated
  using (public.can_manage_project(id));

drop policy if exists project_members_select_project on public.project_members;
create policy project_members_select_project on public.project_members
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists project_members_write_owner on public.project_members;
create policy project_members_write_owner on public.project_members
  for all to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- ------------------------------------------------------------
-- Колонки: видимость по проекту, управление владельцем/админом
-- ------------------------------------------------------------
drop policy if exists columns_select_team on public.columns;
drop policy if exists columns_select_project on public.columns;
create policy columns_select_project on public.columns
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists columns_write_project_manager on public.columns;
create policy columns_write_project_manager on public.columns
  for all to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- ------------------------------------------------------------
-- Задачи: доступ через проект колонки
-- ------------------------------------------------------------
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true and public.can_access_column(column_id))
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_access_column(column_id)
    and (is_private is not true or created_by = auth.uid())
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true and public.can_access_column(column_id))
  )
  with check (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true and public.can_access_column(column_id))
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true and public.can_access_column(column_id))
  );

-- ------------------------------------------------------------
-- Создание проекта с колонками и участниками — одной транзакцией
-- ------------------------------------------------------------
create or replace function public.create_project(
  p_name text,
  p_description text,
  p_columns jsonb,
  p_members jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_owner uuid := auth.uid();
  v_member record;
  v_column record;
  v_count integer;
begin
  if v_owner is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if public.current_role() not in ('admin', 'manager', 'deputy') then
    raise exception 'project_create_denied' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'project_name_required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_columns) <> 'array' or jsonb_array_length(p_columns) = 0 then
    raise exception 'project_columns_required' using errcode = '22023';
  end if;

  if jsonb_array_length(p_columns) > 20 then
    raise exception 'too_many_project_columns' using errcode = '22023';
  end if;

  insert into public.projects (name, description, owner_id)
  values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), v_owner)
  returning id into v_project;

  insert into public.project_members (project_id, profile_id, role)
  values (v_project, v_owner, 'owner')
  on conflict do nothing;

  if jsonb_typeof(p_members) = 'array' then
    for v_member in select * from jsonb_to_recordset(p_members) as x(profile_id uuid, role text)
    loop
      if v_member.profile_id is not null
         and v_member.profile_id <> v_owner
         and v_member.role in ('manager', 'member') then
        insert into public.project_members (project_id, profile_id, role)
        values (v_project, v_member.profile_id, v_member.role)
        on conflict (project_id, profile_id) do update set role = excluded.role;
      end if;
    end loop;
  end if;

  for v_column in
    select btrim(elem->>'title') as title,
           nullif(elem->>'responsible_id', '')::uuid as responsible_id,
           ord
    from jsonb_array_elements(p_columns) with ordinality as t(elem, ord)
  loop
    if length(btrim(coalesce(v_column.title, ''))) > 0 then
      insert into public.columns (project_id, title, position, responsible_id)
      values (v_project, btrim(v_column.title), v_column.ord, v_column.responsible_id);
    end if;
  end loop;

  select count(*) into v_count from public.columns where project_id = v_project;
  if v_count = 0 then
    raise exception 'project_columns_required' using errcode = '22023';
  end if;

  return v_project;
end $$;

revoke all on function public.create_project(text, text, jsonb, jsonb) from public;
grant execute on function public.create_project(text, text, jsonb, jsonb) to authenticated;

commit;
