-- 021_meeting_host.sql
-- Ведущий встречи: может управлять микрофонами участников в комнате.

alter table public.meetings
  add column if not exists host_id uuid references public.profiles(id) on delete set null;

update public.meetings
set host_id = organizer_id
where host_id is null;

create or replace function public.meetings_set_host()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.host_id is null then
    new.host_id := new.organizer_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_meetings_set_host on public.meetings;
create trigger trg_meetings_set_host
  before insert on public.meetings
  for each row execute function public.meetings_set_host();

comment on column public.meetings.host_id is
  'Ведущий встречи; по умолчанию организатор. Управляет микрофонами участников.';
