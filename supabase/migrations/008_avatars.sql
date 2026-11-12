-- ============================================================
--  «Мой Канбан» — миграция 008: фото в аватарке профиля
--
--  1. profiles.avatar_url — публичная ссылка на картинку
--  2. Storage bucket `avatars` (публичное чтение, запись — только своя папка)
--
--  Идемпотентна: можно запускать повторно.
--  Требует миграции 001 (profiles уже есть).
-- ============================================================

-- 1. Ссылка на фото в профиле
alter table public.profiles add column if not exists avatar_url text;

-- 2. Bucket для аватарок
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Политики Storage: читают все (bucket публичный), пишут — только в свою папку <uuid>/…
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_read_public" on storage.objects;
create policy "avatars_read_public"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- ============================================================
-- Проверка:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name = 'avatar_url';
--   select id, public from storage.buckets where id = 'avatars';
-- ============================================================
