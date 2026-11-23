-- 051: мягкое удаление пользователей, восстановление и модули проекта

alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text,
  add column if not exists deleted_by uuid;

create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at);

alter table public.projects
  add column if not exists module_meetings_enabled boolean not null default true,
  add column if not exists module_whiteboard_enabled boolean not null default true,
  add column if not exists module_gantt_enabled boolean not null default true,
  add column if not exists module_secret_santa_enabled boolean not null default true,
  add column if not exists module_analytics_enabled boolean not null default true;

create or replace function public.can_manage_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_actor_role text := public.current_role();
  v_actor_rank integer := public.role_rank(public.current_role());
  v_target_role text;
  v_target_rank integer;
  v_is_owner boolean;
begin
  if auth.uid() is null then return false; end if;
  if p_member_id = auth.uid() then return false; end if;
  select role into v_target_role from public.profiles where id = p_member_id;
  if v_target_role is null then return false; end if;
  v_target_rank := public.role_rank(v_target_role);
  if v_target_role = 'admin' and v_actor_role <> 'admin' then return false; end if;

  if v_actor_role = 'admin' then return true; end if;
  if v_actor_role in ('manager', 'deputy') and v_actor_rank > v_target_rank then return true; end if;

  select exists (
    select 1
    from public.projects p
    join public.project_members pm on pm.project_id = p.id
    where p.owner_id = auth.uid()
      and p.deleted_at is null
      and pm.profile_id = p_member_id
  ) into v_is_owner;
  return coalesce(v_is_owner, false);
end;
$$;

grant execute on function public.can_manage_member(uuid) to authenticated;

create or replace function public.delete_member(p_member_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Требуется вход'; end if;
  if p_member_id = auth.uid() then raise exception 'Нельзя удалить собственный аккаунт'; end if;
  if not public.can_manage_member(p_member_id) then
    raise exception 'Недостаточно прав для удаления этого сотрудника';
  end if;

  select * into v_target from public.profiles where id = p_member_id;
  if not found then raise exception 'Сотрудник не найден'; end if;

  update public.profiles
     set is_active = false,
         deleted_at = now(),
         deleted_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         deleted_by = auth.uid()
   where id = p_member_id;

  -- Блокируем вход на уровне Auth; профиль и история сохраняются для восстановления.
  update auth.users
     set banned_until = now() + interval '100 years'
   where id = p_member_id;
end;
$$;

grant execute on function public.delete_member(uuid, text) to authenticated;

create or replace function public.restore_member(p_member_id uuid, p_role text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_actor_role text := public.current_role();
  v_actor_rank integer := public.role_rank(public.current_role());
  v_new_rank integer;
begin
  if auth.uid() is null then raise exception 'Требуется вход'; end if;
  if not public.can_manage_member(p_member_id) then
    raise exception 'Недостаточно прав для восстановления этого сотрудника';
  end if;

  select * into v_target from public.profiles where id = p_member_id;
  if not found then raise exception 'Сотрудник не найден'; end if;

  if p_role is not null then
    v_new_rank := public.role_rank(p_role);
    if v_new_rank is null or v_new_rank <= 0 then raise exception 'Неизвестная роль'; end if;
    if v_actor_role <> 'admin' and v_new_rank >= v_actor_rank then
      raise exception 'Нельзя выдать роль не ниже своей';
    end if;
  end if;

  update public.profiles
     set is_active = true,
         deleted_at = null,
         deleted_reason = null,
         deleted_by = null,
         role = coalesce(p_role, role)
   where id = p_member_id;

  update auth.users
     set banned_until = null
   where id = p_member_id;
end;
$$;

grant execute on function public.restore_member(uuid, text) to authenticated;
