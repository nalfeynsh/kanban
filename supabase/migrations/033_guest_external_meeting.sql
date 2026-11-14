-- 033_guest_external_meeting.sql
-- Гостевая ссылка должна уметь открывать внешнюю комнату (например, VK Звонки).

drop function if exists public.meeting_by_guest_token(text);

create function public.meeting_by_guest_token(p_token text)
returns table (
  id uuid,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  room_token text,
  status text,
  external_join_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.description,
    m.start_at,
    m.end_at,
    m.room_token,
    m.status,
    m.external_join_url
  from public.meetings m
  where m.guest_token = p_token
    and m.guest_access = true
    and m.status = 'scheduled';
$$;

revoke all on function public.meeting_by_guest_token(text) from public;
grant execute on function public.meeting_by_guest_token(text) to anon, authenticated;

comment on function public.meeting_by_guest_token(text) is
  'Безопасные поля встречи для гостя по секретному токену, включая внешнюю ссылку.';
