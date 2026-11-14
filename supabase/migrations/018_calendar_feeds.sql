-- 018_calendar_feeds.sql
-- Персональная ICS-подписка: Google Calendar / Outlook добавляют URL и
-- автоматически получают изменения встреч без OAuth.

create table if not exists public.calendar_feeds (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

drop policy if exists calendar_feeds_select_own on public.calendar_feeds;
create policy calendar_feeds_select_own on public.calendar_feeds
  for select using (user_id = auth.uid());

drop policy if exists calendar_feeds_insert_own on public.calendar_feeds;
create policy calendar_feeds_insert_own on public.calendar_feeds
  for insert with check (user_id = auth.uid());

drop policy if exists calendar_feeds_delete_own on public.calendar_feeds;
create policy calendar_feeds_delete_own on public.calendar_feeds
  for delete using (user_id = auth.uid());

create or replace function public.get_or_create_calendar_feed()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  feed_token text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into public.calendar_feeds (user_id)
  values (auth.uid())
  on conflict (user_id) do update set user_id = excluded.user_id
  returning token into feed_token;

  return feed_token;
end $$;

revoke all on function public.get_or_create_calendar_feed() from public;
grant execute on function public.get_or_create_calendar_feed() to authenticated;

-- Публичный по токену: только встречи владельца фида, только активные.
create or replace function public.calendar_feed(p_token text)
returns table (
  id uuid,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  room_token text
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
    m.room_token
  from public.calendar_feeds f
  join public.meetings m
    on m.organizer_id = f.user_id
    or exists (
      select 1
      from public.meeting_participants p
      where p.meeting_id = m.id
        and p.user_id = f.user_id
        and p.status <> 'declined'
    )
  where f.token = p_token
    and m.status = 'scheduled'
  order by m.start_at asc;
$$;

revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

comment on table public.calendar_feeds is
  'Персональные токены ICS-подписки; токен — секрет, ссылка не публикуется в профиле.';
comment on function public.calendar_feed(text) is
  'Возвращает встречи владельца токена для ICS-фида; доступ по секретному токену.';
