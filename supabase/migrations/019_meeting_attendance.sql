-- 019_meeting_attendance.sql
-- Фактическое участие во встрече: кто подключался и когда последний раз был в комнате.

create table if not exists public.meeting_attendance (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  first_joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  join_count integer not null default 1,
  primary key (meeting_id, user_id)
);

alter table public.meeting_attendance enable row level security;

drop policy if exists meeting_attendance_select_member on public.meeting_attendance;
create policy meeting_attendance_select_member on public.meeting_attendance
  for select using (public.is_meeting_member(meeting_id, auth.uid()));

drop policy if exists meeting_attendance_insert_own on public.meeting_attendance;
create policy meeting_attendance_insert_own on public.meeting_attendance
  for insert with check (
    user_id = auth.uid() and public.is_meeting_member(meeting_id, auth.uid())
  );

drop policy if exists meeting_attendance_update_own on public.meeting_attendance;
create policy meeting_attendance_update_own on public.meeting_attendance
  for update using (
    user_id = auth.uid() and public.is_meeting_member(meeting_id, auth.uid())
  )
  with check (
    user_id = auth.uid() and public.is_meeting_member(meeting_id, auth.uid())
  );

create or replace function public.meeting_join(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.meetings m
    where m.id = p_meeting_id
      and m.status = 'scheduled'
      and (
        m.organizer_id = auth.uid()
        or exists (
          select 1
          from public.meeting_participants p
          where p.meeting_id = m.id and p.user_id = auth.uid()
        )
      )
  ) then
    raise exception 'meeting_access_denied' using errcode = '42501';
  end if;

  insert into public.meeting_attendance (meeting_id, user_id)
  values (p_meeting_id, auth.uid())
  on conflict (meeting_id, user_id) do update
    set last_seen_at = now(),
        left_at = null,
        join_count = public.meeting_attendance.join_count + 1;
end $$;

create or replace function public.meeting_heartbeat(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.meeting_attendance
  set last_seen_at = now(), left_at = null
  where meeting_id = p_meeting_id and user_id = auth.uid();
end $$;

create or replace function public.meeting_leave(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.meeting_attendance
  set last_seen_at = now(), left_at = now()
  where meeting_id = p_meeting_id and user_id = auth.uid();
end $$;

revoke all on function public.meeting_join(uuid) from public;
revoke all on function public.meeting_heartbeat(uuid) from public;
revoke all on function public.meeting_leave(uuid) from public;
grant execute on function public.meeting_join(uuid) to authenticated;
grant execute on function public.meeting_heartbeat(uuid) to authenticated;
grant execute on function public.meeting_leave(uuid) to authenticated;

comment on table public.meeting_attendance is
  'Фактическое участие: первый вход, последняя активность, выход и число подключений.';
