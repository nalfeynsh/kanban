-- 017_meeting_lifecycle.sql
-- Лимит участников, изменения встречи и Realtime для встреч.

create or replace function public.enforce_meeting_participant_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  select count(*) into current_count
  from public.meeting_participants
  where meeting_id = new.meeting_id;

  if current_count >= 10 then
    raise exception 'meeting_full: в встрече уже 10 участников'
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists trg_meeting_participant_limit on public.meeting_participants;
create trigger trg_meeting_participant_limit
  before insert on public.meeting_participants
  for each row execute function public.enforce_meeting_participant_limit();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meetings'
  ) then
    alter publication supabase_realtime add table public.meetings;
  end if;
end $$;

comment on function public.enforce_meeting_participant_limit() is
  'Жёсткий лимит 10 участников встречи (организатор входит в лимит).';
