-- ============================================================
--  «Мой Канбан» — миграция 004: внутренний чат (1-на-1)
--
--  Что создаётся:
--    conversations        — диалоги
--    conversation_members — участники + last_read_at для непрочитанных
--    messages             — сообщения
--    RPC my_dialogs()     — список диалогов с последним сообщением и unread
--    RPC get_or_create_dialog(peer) — открыть/создать диалог
--    RPC mark_dialog_read(conv)     — отметить прочитанным
--
--  Требует миграцию 001 (таблица profiles, is_admin()).
--  Идемпотентна: можно запускать повторно.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. ТАБЛИЦЫ
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null default '1970-01-01T00:00:00Z',
  created_at      timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc);

create index if not exists conversation_members_profile_idx
  on public.conversation_members (profile_id);

create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc);

-- ------------------------------------------------------------
-- 2. ПРОВЕРКА УЧАСТИЯ
-- ------------------------------------------------------------
create or replace function public.is_conversation_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = p_conversation
      and m.profile_id = auth.uid()
  );
$$;

grant execute on function public.is_conversation_member(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. ДИАЛОГ 1-НА-1
-- ------------------------------------------------------------
create or replace function public.get_or_create_dialog(p_other uuid)
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

  if p_other is null or p_other = v_me then
    raise exception 'Нельзя открыть диалог с самим собой';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_other) then
    raise exception 'Сотрудник не найден';
  end if;

  select m1.conversation_id
    into v_conv
  from public.conversation_members m1
  join public.conversation_members m2
    on m2.conversation_id = m1.conversation_id
   and m2.profile_id = p_other
  where m1.profile_id = v_me
    and (select count(*) from public.conversation_members m3
          where m3.conversation_id = m1.conversation_id) = 2
  limit 1;

  if v_conv is not null then
    return v_conv;
  end if;

  insert into public.conversations (created_by)
  values (v_me)
  returning id into v_conv;

  insert into public.conversation_members (conversation_id, profile_id)
  values (v_conv, v_me), (v_conv, p_other);

  return v_conv;
end;
$$;

grant execute on function public.get_or_create_dialog(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. СПИСОК ДИАЛОГОВ С НЕПРОЧИТАННЫМИ
-- ------------------------------------------------------------
create or replace function public.my_dialogs()
returns table (
  conversation_id uuid,
  peer_id         uuid,
  peer_name       text,
  peer_color      text,
  peer_telegram   text,
  last_message    text,
  last_author     uuid,
  last_message_at timestamptz,
  unread          integer
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
    )
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  join public.conversation_members pm
    on pm.conversation_id = c.id
   and pm.profile_id <> cm.profile_id
  join public.profiles peer on peer.id = pm.profile_id
  left join lateral (
    select m.body, m.author_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where cm.profile_id = auth.uid()
  order by c.last_message_at desc nulls last;
$$;

grant execute on function public.my_dialogs() to authenticated;

-- ------------------------------------------------------------
-- 5. ОТМЕТКА «ПРОЧИТАНО»
-- ------------------------------------------------------------
create or replace function public.mark_dialog_read(p_conversation uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members
     set last_read_at = now()
   where conversation_id = p_conversation
     and profile_id = auth.uid();
$$;

grant execute on function public.mark_dialog_read(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. ОБНОВЛЕНИЕ ВРЕМЕНИ ДИАЛОГА ПРИ НОВОМ СООБЩЕНИИ
-- ------------------------------------------------------------
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ------------------------------------------------------------
-- 7. RLS
-- ------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select, insert, delete on public.messages to authenticated;

drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id));

drop policy if exists conversation_members_select_member on public.conversation_members;
create policy conversation_members_select_member on public.conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists messages_insert_author on public.messages;
create policy messages_insert_author on public.messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists messages_delete_author on public.messages;
create policy messages_delete_author on public.messages
  for delete to authenticated
  using (author_id = auth.uid());

-- ------------------------------------------------------------
-- 8. REALTIME
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

commit;

-- ============================================================
-- Проверка:
--   select * from public.my_dialogs();
--   select tgname from pg_trigger where tgrelid = 'public.messages'::regclass and not tgisinternal;
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
-- ============================================================
