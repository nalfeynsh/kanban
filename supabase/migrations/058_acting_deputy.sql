-- 058: временное исполнение обязанностей заместителя руководителя

alter table public.profiles
  add column if not exists acting_until timestamptz,
  add column if not exists acting_previous_role text;

drop function if exists public.assign_role(uuid, text);

create or replace function public.assign_role(
  p_user_id uuid,
  p_role_key text,
  p_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.roles%rowtype;
  target_role public.roles%rowtype;
  target_current public.roles%rowtype;
  v_previous text;
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
      raise exception 'Нет прав назначать роли';
    end if;
    if actor_role.rank <= target_current.rank then
      raise exception 'Нельзя менять роль сотрудника не ниже себя';
    end if;
    if actor_role.rank <= target_role.rank then
      raise exception 'Нельзя назначить роль не ниже своей';
    end if;
  end if;

  if p_until is not null and p_until <= now() then
    raise exception 'Дата окончания должна быть в будущем';
  end if;

  perform set_config('app.allow_role_change', 'on', true);

  if p_role_key = 'deputy' and p_until is not null then
    v_previous := target_current.key;
    update public.profiles
       set role = p_role_key,
           acting_until = p_until,
           acting_previous_role = v_previous
     where id = p_user_id;
  else
    update public.profiles
       set role = p_role_key,
           acting_until = null,
           acting_previous_role = null
     where id = p_user_id;
  end if;
end;
$$;

create or replace function public.expire_acting_roles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform set_config('app.allow_role_change', 'on', true);
  update public.profiles
     set role = coalesce(acting_previous_role, 'member'),
         acting_until = null,
         acting_previous_role = null
   where role = 'deputy'
     and acting_until is not null
     and acting_until <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.assign_role(uuid, text, timestamptz) to authenticated;
grant execute on function public.expire_acting_roles() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'expire-acting-roles') then
      perform cron.unschedule('expire-acting-roles');
    end if;
    perform cron.schedule(
      'expire-acting-roles',
      '*/5 * * * *',
      'select public.expire_acting_roles();'
    );
  end if;
exception when others then
  null;
end;
$$;
