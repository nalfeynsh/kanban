-- 016_meeting_chat.sql
-- Постоянный чат встречи: текст, файлы, изображения.
-- Доступ — только организатору и участникам встречи.

create table if not exists public.meeting_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  constraint meeting_messages_content_check check (
    length(btrim(body)) > 0 or attachment_path is not null
  )
);

create index if not exists meeting_messages_meeting_idx
  on public.meeting_messages (meeting_id, created_at);

alter table public.meeting_messages enable row level security;

drop policy if exists meeting_messages_select on public.meeting_messages;
create policy meeting_messages_select on public.meeting_messages
  for select using (public.is_meeting_member(meeting_id, auth.uid()));

drop policy if exists meeting_messages_insert on public.meeting_messages;
create policy meeting_messages_insert on public.meeting_messages
  for insert with check (
    author_id = auth.uid()
    and public.is_meeting_member(meeting_id, auth.uid())
  );

drop policy if exists meeting_messages_delete on public.meeting_messages;
create policy meeting_messages_delete on public.meeting_messages
  for delete using (
    author_id = auth.uid()
    or public.is_meeting_organizer(meeting_id, auth.uid())
  );

-- Приватный bucket: путь <meeting_id>/<user_id>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit)
values ('meeting-files', 'meeting-files', false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "meeting_files_insert_member" on storage.objects;
create policy "meeting_files_insert_member"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'meeting-files'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_meeting_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

drop policy if exists "meeting_files_read_member" on storage.objects;
create policy "meeting_files_read_member"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'meeting-files'
    and public.is_meeting_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

drop policy if exists "meeting_files_delete_own" on storage.objects;
create policy "meeting_files_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'meeting-files'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_messages'
  ) then
    alter publication supabase_realtime add table public.meeting_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_participants'
  ) then
    alter publication supabase_realtime add table public.meeting_participants;
  end if;
end $$;

comment on table public.meeting_messages is 'Постоянный чат встречи: текст, файлы, изображения';
comment on column public.meeting_messages.attachment_path is 'Путь в приватном bucket meeting-files';
