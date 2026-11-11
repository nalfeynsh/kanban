-- ============================================================
--  «Мой Канбан» — миграция 006: список собеседников
--
--  Отдаёт только реально авторизованных пользователей
--  (есть строка в auth.users), без «пустых» профилей.
--  Нужен для окна «Кому написать».
--
--  Требует миграции 001 и 004. Идемпотентна.
-- ============================================================

create or replace function public.chat_candidates()
returns table (
  id             uuid,
  full_name      text,
  color          text,
  telegram       text,
  role           text,
  position_title text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.color,
    p.telegram,
    p.role,
    p.position_title
  from public.profiles p
  join auth.users u on u.id = p.id
  where auth.uid() is not null
    and coalesce(p.is_active, true)
  order by p.full_name nulls last;
$$;

grant execute on function public.chat_candidates() to authenticated;

-- ============================================================
-- Проверка:
--   select * from public.chat_candidates();
-- ============================================================
