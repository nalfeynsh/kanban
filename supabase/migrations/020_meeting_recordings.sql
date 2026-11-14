-- 020_meeting_recordings.sql
-- Локальная запись встречи: участник записывает вкладку с комнатой и загружает
-- webm в приватный bucket. Это промежуточный вариант до серверной записи (Egress/Jibri).

create table if not exists public.meeting_recordings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  path text not null unique,
  file_name text not null,
  mime_type text not null default 'video/webm',
  size_bytes bigint not null default 0,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists meeting_recordings_meeting_idx
  on public.meeting_recordings (meeting_id, created_at desc);

alter table public.meeting_recordings enable row level security;

drop policy if exists meeting_recordings_select_member on public.meeting_recordings;
create policy meeting_recordings_select_member on public.meeting_recordings
  for select using (public.is_meeting_member(meeting_id, auth.uid()));

drop policy if exists meeting_recordings_insert_own on public.meeting_recordings;
create policy meeting_recordings_insert_own on public.meeting_recordings
  for insert with check (
    author_id = auth.uid() and public.is_meeting_member(meeting_id, auth.uid())
  );

drop policy if exists meeting_recordings_delete_own_or_organizer on public.meeting_recordings;
create policy meeting_recordings_delete_own_or_organizer on public.meeting_recordings
  for delete using (
    author_id = auth.uid() or public.is_meeting_organizer(meeting_id, auth.uid())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-recordings',
  'meeting-recordings',
  false,
  524288000,
  array['video/webm', 'video/mp4']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists meeting_recordings_storage_read on storage.objects;
create policy meeting_recordings_storage_read on storage.objects
  for select using (
    bucket_id = 'meeting-recordings'
    and public.is_meeting_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

drop policy if exists meeting_recordings_storage_insert on storage.objects;
create policy meeting_recordings_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'meeting-recordings'
    and public.is_meeting_member((storage.foldername(name))[1]::uuid, auth.uid())
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists meeting_recordings_storage_delete on storage.objects;
create policy meeting_recordings_storage_delete on storage.objects
  for delete using (
    bucket_id = 'meeting-recordings'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_meeting_organizer((storage.foldername(name))[1]::uuid, auth.uid())
    )
  );

comment on table public.meeting_recordings is
  'Локальные записи встреч; файлы лежат в приватном bucket meeting-recordings.';
