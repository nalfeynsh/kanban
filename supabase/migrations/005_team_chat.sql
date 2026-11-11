-- ============================================================
--  «Мой Канбан» — миграция 005: общий чат команды
--
--  Добавляет признак is_team у диалога, RPC для получения/создания
--  общего чата и расширяет my_dialogs (is_team + число участников).
--
--  Требует миграцию 004. Идемпотентна.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. ФЛАГ ОБЩЕГО ЧАТА
-- ------------------------------------------------------------
alter table public.conversations
  add column if not exists is_team boolean not null default false;

create unique index if not exists conversations_team_unique
  on public.conversations (is_team)
  where is_team;

-- ------------------------------------------------------------
-- 2. ПОЛУЧИТЬ/СОЗДАТЬ ОБЩИЙ ЧАТ
--    Первый, кто открыл чат, создаёт его; остальные добавляются
--    в участники при открытии (нужно для RLS и непрочитанных).
-- ------------------------------------------------------------
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

  insert into public.conversation_members (conversation_id, profile_id)
  values (v_conv, v_me)
  on conflict (conversation_id, profile_id) do nothing;

  return v_conv;
end;
$$;

grant execute on function public.get_or_create_team_chat() to authenticated;

-- ------------------------------------------------------------
-- 3. СПИСОК ДИАЛОГОВ: общий чат + личные
--    Возвращаемый набор меняется, поэтому drop + create.
-- ------------------------------------------------------------
drop function if exists public.my_dialogs();

create function public.my_dialogs()
returns table (
  conversation_id uuid,
  peer_id         uuid,
  peer_name       text,
  peer_color      text,
  peer_telegram   text,
  last_message    text,
  last_author     uuid,
  last_message_at timestamptz,
  unread          integer,
  is_team         boolean,
  member_count    integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    peer.id,
    peer.full_name,
    peer.color,
    peer.telegram,
    lm.body,
    lm.author_id,
    c.last_message_at,
    (
      select count(*)::integer
      from public.messages m2
      where m2.conversation_id = c.id
        and m2.created_at > cm.last_read_at
        and m2.author_id <> auth.uid()
    ),
    c.is_team,
    (
      select count(*)::integer
      from public.conversation_members mc
      where mc.conversation_id = c.id
    )
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join public.conversation_members pm
    on pm.conversation_id = c.id
   and pm.profile_id <> cm.profile_id
   and c.is_team = false
  left join public.profiles peer on peer.id = pm.profile_id
  left join lateral (
    select m.body, m.author_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where cm.profile_id = auth.uid()
  order by c.is_team desc, c.last_message_at desc nulls last;
$$;

grant execute on function public.my_dialogs() to authenticated;

commit;

-- ============================================================
-- Проверка:
--   select public.get_or_create_team_chat();
--   select conversation_id, peer_name, is_team, member_count
--   from public.my_dialogs();
-- ============================================================
