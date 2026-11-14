-- 024_chat_moderation.sql
-- Модерация чата: молчание/блокировка пользователей, удаление сообщений, очистка чата.
-- Иерархия: admin > manager > deputy > member. Модерировать можно только роль ниже.

create table if not exists public.chat_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('mute', 'ban')),
  reason text,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_restrictions enable row level security;

drop policy if exists chat_restrictions_select_authenticated on public.chat_restrictions;
create policy chat_restrictions_select_authenticated on public.chat_restrictions
  for select to authenticated
  using (true);

-- Прямая запись запрещена: только через RPC с проверкой иерархии.
drop policy if exists chat_restrictions_write on public.chat_restrictions;

create or replace function public.role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case coalesce(p_role, 'member')
    when 'admin' then 4
    when 'manager' then 3
    when 'deputy' then 2
    else 1
  end;
$$;

create or replace function public.can_moderate_chat_user(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles actor
    join public.profiles target on target.id = p_target
    where actor.id = auth.uid()
      and actor.role in ('admin', 'manager', 'deputy')
      and public.role_rank(actor.role) > public.role_rank(target.role)
  );
$$;

create or replace function public.is_chat_muted(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_restrictions r
    where r.user_id = p_user
      and (r.expires_at is null or r.expires_at > now())
  );
$$;

create or replace function public.moderate_chat_user(
  p_user uuid,
  p_kind text,
  p_minutes integer default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz;
  v_row public.chat_restrictions;
begin
  if p_user = auth.uid() then
    raise exception 'cannot_moderate_self' using errcode = '22023';
  end if;
  if p_kind not in ('mute', 'ban') then
    raise exception 'invalid_chat_restriction' using errcode = '22023';
  end if;
  if not public.can_moderate_chat_user(p_user) then
    raise exception 'chat_moderation_denied' using errcode = '42501';
  end if;

  if p_kind = 'mute' then
    if p_minutes is null or p_minutes < 1 or p_minutes > 10080 then
      raise exception 'invalid_mute_minutes' using errcode = '22023';
    end if;
    v_expires := now() + make_interval(mins => p_minutes);
  else
    v_expires := null;
  end if;

  insert into public.chat_restrictions (user_id, kind, reason, expires_at, created_by)
  values (p_user, p_kind, nullif(btrim(coalesce(p_reason, '')), ''), v_expires, auth.uid())
  on conflict (user_id) do update
    set kind = excluded.kind,
        reason = excluded.reason,
        expires_at = excluded.expires_at,
        created_by = excluded.created_by,
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'kind', v_row.kind,
    'reason', v_row.reason,
    'expires_at', v_row.expires_at,
    'created_by', v_row.created_by
  );
end $$;

create or replace function public.unmute_chat_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_moderate_chat_user(p_user) then
    raise exception 'chat_moderation_denied' using errcode = '42501';
  end if;
  delete from public.chat_restrictions where user_id = p_user;
end $$;

create or replace function public.clear_conversation_messages(p_conversation uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if public.current_role() <> 'admin' then
    raise exception 'chat_admin_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.conversations where id = p_conversation) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  delete from public.messages where conversation_id = p_conversation;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.role_rank(text) from public;
revoke all on function public.can_moderate_chat_user(uuid) from public;
revoke all on function public.is_chat_muted(uuid) from public;
revoke all on function public.moderate_chat_user(uuid, text, integer, text) from public;
revoke all on function public.unmute_chat_user(uuid) from public;
revoke all on function public.clear_conversation_messages(uuid) from public;
grant execute on function public.can_moderate_chat_user(uuid) to authenticated;
grant execute on function public.is_chat_muted(uuid) to authenticated;
grant execute on function public.moderate_chat_user(uuid, text, integer, text) to authenticated;
grant execute on function public.unmute_chat_user(uuid) to authenticated;
grant execute on function public.clear_conversation_messages(uuid) to authenticated;

-- Мьют/бан запрещает отправку сообщений.
drop policy if exists messages_insert_author on public.messages;
create policy messages_insert_author on public.messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and not public.is_chat_muted(auth.uid())
  );

-- Автор удаляет свои сообщения; модератор — сообщения роли ниже.
drop policy if exists messages_delete_moderator on public.messages;
create policy messages_delete_moderator on public.messages
  for delete to authenticated
  using (
    author_id = auth.uid()
    or public.can_moderate_chat_user(author_id)
  );

-- Администратор может очистить чат вместе с файлами.
drop policy if exists chat_files_moderator_delete on storage.objects;
create policy chat_files_moderator_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and (
      public.current_role() = 'admin'
      or public.can_moderate_chat_user((storage.foldername(name))[2]::uuid)
    )
  );

comment on table public.chat_restrictions is
  'Молчание (mute, до времени) и блокировка (ban, бессрочно) чата.';
comment on function public.can_moderate_chat_user(uuid) is
  'Модератор может действовать только на роль ниже своей.';
comment on function public.clear_conversation_messages(uuid) is
  'Полная очистка сообщений чата; только администратор.';
