-- ============================================================
--  «Мой Канбан» — миграция 010: предложения по доработке
--
--  Таблица suggestions: сотрудник пишет идею, видят все
--  авторизованные участники. Удалить может автор или админ.
--
--  Идемпотентна. Требует миграции 001 (profiles, is_admin()).
-- ============================================================

create table if not exists public.suggestions (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 3 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists suggestions_created_idx
  on public.suggestions (created_at desc);

alter table public.suggestions enable row level security;

grant select, insert, delete on public.suggestions to authenticated;

-- Читают все авторизованные участники
drop policy if exists suggestions_select_all on public.suggestions;
create policy suggestions_select_all on public.suggestions
  for select to authenticated
  using (true);

-- Создаёт только от своего имени
drop policy if exists suggestions_insert_own on public.suggestions;
create policy suggestions_insert_own on public.suggestions
  for insert to authenticated
  with check (author_id = auth.uid());

-- Удаляет автор или администратор
drop policy if exists suggestions_delete_own on public.suggestions;
create policy suggestions_delete_own on public.suggestions
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ============================================================
-- Проверка:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'suggestions';
--   select * from public.suggestions order by created_at desc limit 5;
-- ============================================================
