-- 034_custom_roles.sql
-- Пользовательские роли: ранги, права, управление и назначение.
-- Системные роли (admin/manager/deputy/member) остаются неизменяемыми.

create table if not exists public.roles (
  key text primary key,
  name text not null,
  rank integer not null check (rank between 1 and 99),
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists roles_name_lower_uidx
  on public.roles (lower(name));

alter table public.roles enable row level security;

drop policy if exists roles_select_authenticated on public.roles;
create policy roles_select_authenticated
  on public.roles for select
  to authenticated
  using (true);

grant select on public.roles to authenticated;

insert into public.roles (key, name, rank, permissions, is_system) values
  (
    'admin', 'Администратор', 99,
    array[
      'tasks.create','tasks.editTeam','tasks.archive','tasks.assign',
      'tasks.manageAny','tasks.priority','team.view','roles.manage',
      'invites.view','invites.create','invites.revoke','columns.manage'
    ],
    true
  ),
  (
    'manager', 'Менеджер', 70,
    array[
      'tasks.create','tasks.editTeam','tasks.archive','tasks.assign',
      'tasks.manageAny','tasks.priority','team.view','roles.manage',
      'invites.view','invites.create'
    ],
    true
  ),
  (
    'deputy', 'Заместитель', 50,
    array[
      'tasks.create','tasks.editTeam','tasks.archive','tasks.assign',
      'tasks.priority','team.view','roles.manage'
    ],
    true
  ),
  (
    'member', 'Сотрудник', 20,
    array['tasks.create','tasks.editTeam','tasks.archive','team.view'],
    true
  )
on conflict (key) do update set
  name = excluded.name,
  rank = excluded.rank,
  permissions = excluded.permissions,
  is_system = true,
  updated_at = now();

-- Явные Unicode-имена: не зависят от кодировки SQL-клиента.
update public.roles set name = U&'\0410\0434\043C\0438\043D\0438\0441\0442\0440\0430\0442\043E\0440' where key = 'admin';
update public.roles set name = U&'\041C\0435\043D\0435\0434\0436\0435\0440' where key = 'manager';
update public.roles set name = U&'\0417\0430\043C\0435\0441\0442\0438\0442\0435\043B\044C' where key = 'deputy';
update public.roles set name = U&'\0421\043E\0442\0440\0443\0434\043D\0438\043A' where key = 'member';

-- Существующие значения role остаются ключами ролей.
alter table public.profiles drop constraint if exists profiles_role_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_fkey' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_fkey
      foreign key (role) references public.roles(key)
      on update cascade on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invites_role_fkey' and conrelid = 'public.invites'::regclass
  ) then
    alter table public.invites
      add constraint invites_role_fkey
      foreign key (role) references public.roles(key)
      on update cascade on delete restrict;
  end if;
end $$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p_permission = any(r.permissions)
    from public.profiles p
    join public.roles r on r.key = p.role
    where p.id = auth.uid()
  ), false);
$$;

create or replace function public.role_rank_key(p_role_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select rank from public.roles where key = p_role_key), 0);
$$;

create or replace function public.role_permissions_key(p_role_key text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select permissions from public.roles where key = p_role_key), '{}');
$$;

create or replace function public.can_manage_role(
  p_target_rank integer,
  p_permissions text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      case
        when actor_role.key = 'admin' then true
        else
          public.has_permission('roles.manage')
          and actor_role.rank > p_target_rank
          and p_permissions <@ actor_role.permissions
      end
    from public.profiles p
    join public.roles actor_role on actor_role.key = p.role
    where p.id = auth.uid()
  ), false);
$$;

create or replace function public.create_role(
  p_name text,
  p_rank integer,
  p_permissions text[]
)
returns public.roles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.roles%rowtype;
  new_key text;
  clean_name text := btrim(coalesce(p_name, ''));
  clean_permissions text[] := coalesce(p_permissions, '{}');
  permission_catalog text[] := array[
    'tasks.create','tasks.editTeam','tasks.archive','tasks.assign',
    'tasks.manageAny','tasks.priority','team.view','roles.manage',
    'invites.view','invites.create','invites.revoke','columns.manage'
  ];
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  select r.* into actor_role
  from public.profiles p
  join public.roles r on r.key = p.role
  where p.id = auth.uid();

  if actor_role.key is null then
    raise exception 'Роль пользователя не найдена';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 40 then
    raise exception 'Название роли: от 2 до 40 символов';
  end if;

  if p_rank is null or p_rank < 1 or p_rank > 98 then
    raise exception 'Ранг роли: от 1 до 98';
  end if;

  if exists (select 1 from public.roles where lower(name) = lower(clean_name)) then
    raise exception 'Роль с таким названием уже существует';
  end if;

  if not (clean_permissions <@ permission_catalog) then
    raise exception 'Неизвестное право в наборе';
  end if;

  if actor_role.key <> 'admin' then
    if not public.has_permission('roles.manage') then
      raise exception 'Нет права управлять ролями';
    end if;
    if p_rank >= actor_role.rank then
      raise exception 'Нельзя создать роль не ниже своей';
    end if;
    if not (clean_permissions <@ actor_role.permissions) then
      raise exception 'Нельзя выдать права, которых нет у вашей роли';
    end if;
  end if;

  new_key := 'custom_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  insert into public.roles (key, name, rank, permissions, is_system, created_by)
  values (new_key, clean_name, p_rank, clean_permissions, false, auth.uid())
  returning * into actor_role;

  return actor_role;
end;
$$;

create or replace function public.update_role(
  p_key text,
  p_name text,
  p_rank integer,
  p_permissions text[]
)
returns public.roles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.roles%rowtype;
  target_role public.roles%rowtype;
  clean_name text := btrim(coalesce(p_name, ''));
  clean_permissions text[] := coalesce(p_permissions, '{}');
  permission_catalog text[] := array[
    'tasks.create','tasks.editTeam','tasks.archive','tasks.assign',
    'tasks.manageAny','tasks.priority','team.view','roles.manage',
    'invites.view','invites.create','invites.revoke','columns.manage'
  ];
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  select r.* into actor_role
  from public.profiles p
  join public.roles r on r.key = p.role
  where p.id = auth.uid();

  if actor_role.key is null then
    raise exception 'Роль пользователя не найдена';
  end if;

  select * into target_role from public.roles where key = p_key;
  if target_role.key is null then
    raise exception 'Роль не найдена';
  end if;
  if target_role.is_system then
    raise exception 'Системную роль нельзя изменить';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 40 then
    raise exception 'Название роли: от 2 до 40 символов';
  end if;
  if p_rank is null or p_rank < 1 or p_rank > 98 then
    raise exception 'Ранг роли: от 1 до 98';
  end if;
  if exists (
    select 1 from public.roles
    where lower(name) = lower(clean_name) and key <> p_key
  ) then
    raise exception 'Роль с таким названием уже существует';
  end if;
  if not (clean_permissions <@ permission_catalog) then
    raise exception 'Неизвестное право в наборе';
  end if;

  if actor_role.key <> 'admin' then
    if not public.has_permission('roles.manage') then
      raise exception 'Нет права управлять ролями';
    end if;
    if actor_role.rank <= target_role.rank then
      raise exception 'Нельзя менять роль не ниже своей';
    end if;
    if p_rank >= actor_role.rank then
      raise exception 'Нельзя поднять роль до своей или выше';
    end if;
    if not (clean_permissions <@ actor_role.permissions) then
      raise exception 'Нельзя выдать права, которых нет у вашей роли';
    end if;
  end if;

  update public.roles
  set name = clean_name,
      rank = p_rank,
      permissions = clean_permissions,
      updated_at = now()
  where key = p_key
  returning * into target_role;

  return target_role;
end;
$$;

create or replace function public.delete_role(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.roles%rowtype;
  target_role public.roles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  select r.* into actor_role
  from public.profiles p
  join public.roles r on r.key = p.role
  where p.id = auth.uid();

  if actor_role.key is null then
    raise exception 'Роль пользователя не найдена';
  end if;

  select * into target_role from public.roles where key = p_key;
  if target_role.key is null then
    raise exception 'Роль не найдена';
  end if;
  if target_role.is_system then
    raise exception 'Системную роль нельзя удалить';
  end if;

  if actor_role.key <> 'admin' then
    if not public.has_permission('roles.manage') then
      raise exception 'Нет права управлять ролями';
    end if;
    if actor_role.rank <= target_role.rank then
      raise exception 'Нельзя удалить роль не ниже своей';
    end if;
  end if;

  if exists (select 1 from public.profiles where role = p_key) then
    raise exception 'Роль назначена сотрудникам. Сначала переназначьте их.';
  end if;

  if exists (select 1 from public.invites where role = p_key) then
    raise exception 'Роль указана в приглашении. Сначала удалите приглашение.';
  end if;

  delete from public.roles where key = p_key;
end;
$$;

create or replace function public.assign_role(p_user_id uuid, p_role_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.roles%rowtype;
  target_role public.roles%rowtype;
  target_current public.roles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Свою роль изменить нельзя';
  end if;

  select r.* into actor_role
  from public.profiles p
  join public.roles r on r.key = p.role
  where p.id = auth.uid();

  if actor_role.key is null then
    raise exception 'Роль пользователя не найдена';
  end if;

  select r.* into target_role from public.roles r where r.key = p_role_key;
  if target_role.key is null then
    raise exception 'Роль не найдена';
  end if;

  select r.* into target_current
  from public.profiles p
  join public.roles r on r.key = p.role
  where p.id = p_user_id;
  if target_current.key is null then
    raise exception 'Сотрудник не найден';
  end if;

  if actor_role.key <> 'admin' then
    if not public.has_permission('roles.manage') then
      raise exception 'Нет права назначать роли';
    end if;
    if actor_role.rank <= target_current.rank then
      raise exception 'Нельзя менять роль сотрудника не ниже своей';
    end if;
    if actor_role.rank <= target_role.rank then
      raise exception 'Нельзя назначить роль не ниже своей';
    end if;
  end if;

  perform set_config('app.allow_role_change', 'on', true);
  update public.profiles set role = p_role_key where id = p_user_id;
end;
$$;

-- Системная защита: роль меняется только через assign_role / приглашение.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is null or current_setting('app.allow_role_change', true) = 'on' then
      return new;
    end if;
    raise exception 'Роль меняется через управление ролями';
  end if;
  return new;
end;
$$;

-- Приглашение при регистрации тоже проходит через защиту роли.
create or replace function public.consume_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invites
     set used_at = now()
   where lower(email) = lower(new.email)
     and used_at is null;

  perform set_config('app.allow_role_change', 'on', true);
  update public.profiles
     set role = coalesce(
       (select i.role from public.invites i
         where lower(i.email) = lower(new.email)
         order by i.created_at desc limit 1),
       'member'
     )
   where id = new.id;

  return new;
end;
$$;

-- Права на задачи: интерфейс + сервер.
create or replace function public.enforce_task_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if not public.has_permission('tasks.create') then
      raise exception 'Нет права создавать задачи';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.has_permission('tasks.archive') then
      raise exception 'Нет права удалять задачи';
    end if;
    return old;
  end if;

  if (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.due_at is distinct from old.due_at
    or new.start_at is distinct from old.start_at
    or new.links is distinct from old.links
    or new.files is distinct from old.files
    or new.column_id is distinct from old.column_id
  ) and not (
    public.has_permission('tasks.editTeam') or public.has_permission('tasks.manageAny')
  ) then
    raise exception 'Нет права редактировать задачи';
  end if;

  if new.priority is distinct from old.priority
     and not public.has_permission('tasks.priority') then
    raise exception 'Нет права менять приоритет';
  end if;

  if new.assignee_id is distinct from old.assignee_id
     and not public.has_permission('tasks.assign') then
    raise exception 'Нет права назначать исполнителей';
  end if;

  if new.deleted_at is distinct from old.deleted_at
     and not public.has_permission('tasks.archive') then
    raise exception 'Нет права архивировать задачи';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_enforce_permissions on public.tasks;
create trigger tasks_enforce_permissions
  before insert or update or delete on public.tasks
  for each row execute function public.enforce_task_permissions();

-- Приглашение можно выдать только на роль ниже своей.
create or replace function public.enforce_invite_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.roles%rowtype;
begin
  if auth.uid() is null then
    return new;
  end if;

  select r.* into actor_role
  from public.profiles p
  join public.roles r on r.key = p.role
  where p.id = auth.uid();

  if actor_role.key is null then
    raise exception 'Роль пользователя не найдена';
  end if;

  if actor_role.key <> 'admin'
     and actor_role.rank <= public.role_rank_key(new.role) then
    raise exception 'Нельзя пригласить сотрудника на роль не ниже своей';
  end if;

  return new;
end;
$$;

drop trigger if exists invites_enforce_role on public.invites;
create trigger invites_enforce_role
  before insert or update of role on public.invites
  for each row execute function public.enforce_invite_role();

-- Приглашения: проверки прав вместо жёстких названий ролей.
drop policy if exists invites_read_staff on public.invites;
create policy invites_read_staff
  on public.invites for select
  to authenticated
  using (public.has_permission('invites.view'));

drop policy if exists invites_insert_staff on public.invites;
create policy invites_insert_staff
  on public.invites for insert
  to authenticated
  with check (public.has_permission('invites.create'));

drop policy if exists invites_update_admin on public.invites;
create policy invites_update_admin
  on public.invites for update
  to authenticated
  using (public.has_permission('invites.create'))
  with check (public.has_permission('invites.create'));

drop policy if exists invites_delete_admin on public.invites;
create policy invites_delete_admin
  on public.invites for delete
  to authenticated
  using (public.has_permission('invites.revoke'));

grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.role_rank_key(text) to authenticated;
grant execute on function public.role_permissions_key(text) to authenticated;
grant execute on function public.create_role(text, integer, text[]) to authenticated;
grant execute on function public.update_role(text, text, integer, text[]) to authenticated;
grant execute on function public.delete_role(text) to authenticated;
grant execute on function public.assign_role(uuid, text) to authenticated;

revoke execute on function public.create_role(text, integer, text[]) from anon;
revoke execute on function public.update_role(text, text, integer, text[]) from anon;
revoke execute on function public.delete_role(text) from anon;
revoke execute on function public.assign_role(uuid, text) from anon;
