-- 023_meeting_guests.sql
-- Гостевой доступ к встрече без аккаунта Канбана: одноразовая секретная ссылка.
-- Гость получает только безопасные поля встречи и ссылку на комнату.

alter table public.meetings
  add column if not exists guest_access boolean not null default false;

alter table public.meetings
  add column if not exists guest_token text;

create unique index if not exists meetings_guest_token_key
  on public.meetings (guest_token)
  where guest_token is not null;

create or replace function public.enable_meeting_guest_access(p_meeting_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_token text;
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  new_token := encode(gen_random_bytes(18), 'hex');

  update public.meetings
  set guest_access = true,
      guest_token = new_token
  where id = p_meeting_id
    and organizer_id = auth.uid()
    and status = 'scheduled';

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'meeting_access_denied' using errcode = '42501';
  end if;

  return new_token;
end $$;

create or replace function public.disable_meeting_guest_access(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.meetings
  set guest_access = false,
      guest_token = null
  where id = p_meeting_id
    and organizer_id = auth.uid();
end $$;

create or replace function public.meeting_by_guest_token(p_token text)
returns table (
  id uuid,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  room_token text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.title, m.description, m.start_at, m.end_at, m.room_token, m.status
  from public.meetings m
  where m.guest_token = p_token
    and m.guest_access = true
    and m.status = 'scheduled';
$$;

revoke all on function public.enable_meeting_guest_access(uuid) from public;
revoke all on function public.disable_meeting_guest_access(uuid) from public;
revoke all on function public.meeting_by_guest_token(text) from public;
grant execute on function public.enable_meeting_guest_access(uuid) to authenticated;
grant execute on function public.disable_meeting_guest_access(uuid) to authenticated;
grant execute on function public.meeting_by_guest_token(text) to anon, authenticated;

comment on column public.meetings.guest_token is
  'Секретный токен гостевой ссылки; показывается организатору.';
comment on function public.meeting_by_guest_token(text) is
  'Безопасные поля встречи для гостя по секретному токену.';
