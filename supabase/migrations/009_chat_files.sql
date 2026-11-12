-- ============================================================
--  «Мой Канбан» — миграция 009: файлы в чате
--
--  1. Поля вложения у сообщения (одно вложение на сообщение)
--  2. Storage bucket `chat-files` (публичное чтение, запись — своя папка)
--  3. Политики Storage
--
--  Путь файла: <conversation_id>/<user_id>/<uuid>.<ext>
--  Чтение публичное (как у task-files), поэтому пересылка файла
--  другому пользователю не требует копирования объекта.
--
--  Идемпотентна. Требует миграции 004 (messages) и 001.
-- ============================================================

-- 1. Вложение в сообщении
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_type text;
alter table public.messages add column if not exists attachment_size bigint;

-- 2. Bucket для файлов чата (лимит 25 МБ)
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', true, 26214400)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit;

-- 3. Политики Storage
drop policy if exists "chat_files_insert_own" on storage.objects;
create policy "chat_files_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "chat_files_delete_own" on storage.objects;
create policy "chat_files_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "chat_files_read_public" on storage.objects;
create policy "chat_files_read_public"
  on storage.objects for select
  to public
  using (bucket_id = 'chat-files');

-- ============================================================
-- Проверка:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'messages'
--     and column_name like 'attachment%';
--   select id, public, file_size_limit from storage.buckets where id = 'chat-files';
-- ============================================================
