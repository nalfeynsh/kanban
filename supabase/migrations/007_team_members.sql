-- ============================================================
--  «Мой Канбан» — миграция 007: все сотрудники в общем чате
--
--  Раньше участник добавлялся в общий чат только когда сам его
--  открывал, поэтому счётчик показывал «1 участник».
--  Теперь в общий чат сразу попадают все зарегистрированные
--  активные пользователи.
--
--  Требует миграции 005. Идемпотентна.
-- ============================================================

begin;

create or replace function public.get_or_create_team_chat()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_conv uuid;
begin
  if v_me is null then
    raise exception 'Не авторизован';
  end if;

  select id into v_conv from public.conversations where is_team limit 1;

  if v_conv is null then
    insert into public.conversations (created_by, is_team)
    values (v_me, true)
    returning id into v_conv;
  end if;

  -- Все зарегистрированные и активные сотрудники — участники общего чата
  insert into public.conversation_members (conversation_id, profile_id)
  select v_conv, p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where coalesce(p.is_active, true)
  on conflict (conversation_id, profile_id) do nothing;

  return v_conv;
end;
$$;

grant execute on function public.get_or_create_team_chat() to authenticated;

-- Разово добираем участников в уже существующий общий чат
do $$
declare
  v_conv uuid;
begin
  select id into v_conv from public.conversations where is_team limit 1;
  if v_conv is not null then
    insert into public.conversation_members (conversation_id, profile_id)
    select v_conv, p.id
    from public.profiles p
    join auth.users u on u.id = p.id
    where coalesce(p.is_active, true)
    on conflict (conversation_id, profile_id) do nothing;
  end if;
end $$;

commit;

-- ============================================================
-- Проверка:
--   select public.get_or_create_team_chat();
--   select count(*) from public.conversation_members m
--   join public.conversations c on c.id = m.conversation_id
--   where c.is_team;
-- ============================================================
