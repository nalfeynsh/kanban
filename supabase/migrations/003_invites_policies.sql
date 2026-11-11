-- ============================================================
--  «Мой Канбан» — миграция 003: расширенные права на приглашения
--  Нужна для панели «Доступ»: менеджеры могут приглашать,
--  администраторы — отзывать приглашения.
--
--  Требует применённой миграции 001 (функции is_admin/current_role).
--  Идемпотентна: можно запускать повторно.
-- ============================================================

begin;

-- Читать приглашения: администраторы и менеджеры
drop policy if exists invites_read_staff on public.invites;
create policy invites_read_staff on public.invites
  for select to authenticated
  using (public.is_admin() or public.current_role() = 'manager');

-- Создавать приглашения: администраторы и менеджеры
drop policy if exists invites_insert_admin on public.invites;
drop policy if exists invites_insert_staff on public.invites;
create policy invites_insert_staff on public.invites
  for insert to authenticated
  with check (public.is_admin() or public.current_role() = 'manager');

-- Менять (например, продлить или пометить): только администратор
drop policy if exists invites_update_admin on public.invites;
create policy invites_update_admin on public.invites
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Отзывать (удалять) приглашения: только администратор
drop policy if exists invites_delete_admin on public.invites;
create policy invites_delete_admin on public.invites
  for delete to authenticated
  using (public.is_admin());

commit;

-- ============================================================
-- Проверка политик:
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='invites' order by policyname;
--
-- Ожидаем: invites_insert_staff (INSERT), invites_read_staff (SELECT),
--          invites_update_admin (UPDATE), invites_delete_admin (DELETE).
-- ============================================================
