-- 015_meetings.sql
-- Phase 1 ВКС: встречи, участники, приглашения и доступ к комнате.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  room_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_time_check check (end_at > start_at)
);

create table if not exists public.meeting_participants (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (meeting_id, user_id)
);

create index if not exists meetings_start_idx
  on public.meetings (start_at)
  where status = 'scheduled';

create index if not exists meeting_participants_user_idx
  on public.meeting_participants (user_id, meeting_id);

create or replace function public.meetings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_meetings_updated_at on public.meetings;
create trigger trg_meetings_updated_at
  before update on public.meetings
  for each row execute function public.meetings_touch_updated_at();

-- Организатор всегда участник встречи
create or replace function public.meeting_add_organizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.meeting_participants (meeting_id, user_id, status, responded_at)
  values (new.id, new.organizer_id, 'accepted', now())
  on conflict (meeting_id, user_id) do update
    set status = 'accepted', responded_at = now();
  return new;
end $$;

drop trigger if exists trg_meeting_add_organizer on public.meetings;
create trigger trg_meeting_add_organizer
  after insert on public.meetings
  for each row execute function public.meeting_add_organizer();

-- Помощники обходят RLS внутри policy и не вызывают рекурсию
create or replace function public.is_meeting_member(p_meeting_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting_id and m.organizer_id = p_user_id
  ) or exists (
    select 1 from public.meeting_participants p
    where p.meeting_id = p_meeting_id and p.user_id = p_user_id
  );
$$;

create or replace function public.is_meeting_organizer(p_meeting_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting_id and m.organizer_id = p_user_id
  );
$$;

revoke all on function public.is_meeting_member(uuid, uuid) from public;
revoke all on function public.is_meeting_organizer(uuid, uuid) from public;
grant execute on function public.is_meeting_member(uuid, uuid) to authenticated;
grant execute on function public.is_meeting_organizer(uuid, uuid) to authenticated;

alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;

drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select using (public.is_meeting_member(id, auth.uid()));

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings
  for insert with check (organizer_id = auth.uid());

drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings
  for update using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings
  for delete using (organizer_id = auth.uid());

drop policy if exists meeting_participants_select on public.meeting_participants;
create policy meeting_participants_select on public.meeting_participants
  for select using (public.is_meeting_member(meeting_id, auth.uid()));

drop policy if exists meeting_participants_insert on public.meeting_participants;
create policy meeting_participants_insert on public.meeting_participants
  for insert with check (public.is_meeting_organizer(meeting_id, auth.uid()));

drop policy if exists meeting_participants_update on public.meeting_participants;
create policy meeting_participants_update on public.meeting_participants
  for update using (
    public.is_meeting_organizer(meeting_id, auth.uid())
    or user_id = auth.uid()
  )
  with check (
    public.is_meeting_organizer(meeting_id, auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists meeting_participants_delete on public.meeting_participants;
create policy meeting_participants_delete on public.meeting_participants
  for delete using (
    public.is_meeting_organizer(meeting_id, auth.uid())
    or user_id = auth.uid()
  );

comment on table public.meetings is 'Встречи ВКС: организатор, время, комната, статус';
comment on table public.meeting_participants is 'Приглашения и ответы участников встречи';
comment on column public.meetings.room_token is 'Случайный токен комнаты для ссылки /meet/<token>';
