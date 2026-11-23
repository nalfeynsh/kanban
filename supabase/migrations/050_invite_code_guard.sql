-- 050: серверная проверка ссылки-приглашения и кода доступа

create or replace function public.guard_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_invite_id text := new.raw_user_meta_data->>'invite_id';
  v_code text := new.raw_user_meta_data->>'invite_code';
begin
  if new.email is null then
    raise exception 'Регистрация возможна только по подтверждённой почте из приглашения';
  end if;

  select i.* into v_invite
  from public.invites i
  where i.used_at is null
    and (i.expires_at is null or i.expires_at > now())
    and (
      (v_invite_id is not null and i.id::text = v_invite_id)
      or (v_invite_id is null and lower(i.email) = lower(new.email))
    )
  order by i.created_at desc
  limit 1;

  if not found then
    raise exception 'Доступ к сервису закрыт: приглашение не найдено, уже использовано или истекло';
  end if;

  if lower(v_invite.email) <> lower(new.email) then
    raise exception 'Приглашение выдано для другой почты';
  end if;

  if v_invite.code is not null
     and btrim(v_invite.code) <> ''
     and v_invite.code <> coalesce(v_code, '') then
    raise exception 'Неверный код доступа';
  end if;

  return new;
end;
$$;

create or replace function public.consume_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_invite_id text := new.raw_user_meta_data->>'invite_id';
begin
  select i.* into v_invite
  from public.invites i
  where i.used_at is null
    and (
      (v_invite_id is not null and i.id::text = v_invite_id)
      or (v_invite_id is null and lower(i.email) = lower(new.email))
    )
  order by i.created_at desc
  limit 1;

  if found then
    update public.invites
       set used_at = now()
     where id = v_invite.id;

    update public.profiles
       set role = coalesce(v_invite.role, 'member')
     where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_signup on auth.users;
create trigger guard_signup
  before insert on auth.users
  for each row execute function public.guard_signup();

drop trigger if exists consume_invite on auth.users;
drop trigger if exists zz_consume_invite on auth.users;
create trigger zz_consume_invite
  after insert on auth.users
  for each row execute function public.consume_invite();
