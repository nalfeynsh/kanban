-- 012_api_integrations.sql
-- Публичный API v1 для интеграции с внешними системами (доска Игоря).
--
-- Что добавляет:
--   1. Внешние идентификаторы задач и updated_at для двусторонней синхронизации.
--   2. API-токены (хранится только SHA-256), создание/отзыв из панели «Команда → Интеграции».
--   3. RPC api_v1_* для чтения колонок/задач и upsert/архивирования задач.
--   4. Контракт рассчитан на polling: GET /api/v1/tasks?since=...
--
-- Выполнять в Supabase → SQL Editor одним запросом.

create extension if not exists pgcrypto;

-- 1. Поля синхронизации -------------------------------------------------------
alter table public.tasks
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists tasks_external_id_idx
  on public.tasks (external_id)
  where external_id is not null;

create index if not exists tasks_updated_at_idx
  on public.tasks (updated_at);

-- updated_at меняется при локальных правках, но позволяет применить
-- более новую удалённую версию (тогда API передаёт updated_at явно).
create or replace function public.tasks_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, now());
  elsif new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before insert or update on public.tasks
  for each row execute function public.tasks_touch_updated_at();

-- 2. API-токены ---------------------------------------------------------------
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefix text not null,
  token_hash text not null unique,
  scopes text[] not null default array['tasks:read','tasks:write'],
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.api_tokens enable row level security;

create or replace function public.api_token_admin()
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.create_api_token(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_token text;
  new_id uuid;
begin
  if not public.api_token_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'token_name_required' using errcode = '22023';
  end if;

  new_token := 'kb_' || encode(gen_random_bytes(24), 'hex');

  insert into public.api_tokens (name, prefix, token_hash, created_by)
  values (
    left(trim(p_name), 80),
    left(new_token, 10),
    encode(digest(new_token, 'sha256'), 'hex'),
    auth.uid()
  )
  returning id into new_id;

  return jsonb_build_object(
    'id', new_id,
    'name', left(trim(p_name), 80),
    'prefix', left(new_token, 10),
    'token', new_token
  );
end $$;

create or replace function public.list_api_tokens()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'prefix', prefix,
        'created_at', created_at,
        'last_used_at', last_used_at,
        'revoked_at', revoked_at
      )
      order by created_at desc
    ),
    '[]'::jsonb
  )
  from public.api_tokens
  where public.api_token_admin();
$$;

create or replace function public.revoke_api_token(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.api_token_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.api_tokens
  set revoked_at = now()
  where id = p_id and revoked_at is null;

  return found;
end $$;

-- 3. Проверка токена и RPC API ------------------------------------------------
create or replace function public.api_v1_auth(p_token text)
returns public.api_tokens
language sql
security definer
set search_path = public, extensions
as $$
  select *
  from public.api_tokens
  where p_token is not null
    and token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
  limit 1;
$$;

create or replace function public.api_v1_touch(p_token_id uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.api_tokens set last_used_at = now() where id = p_token_id;
$$;

create or replace function public.api_v1_columns(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.api_tokens;
  result jsonb;
begin
  select * into tok from public.api_v1_auth(p_token);
  if tok.id is null then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  perform public.api_v1_touch(tok.id);

  select coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'title', title, 'position', position) order by position),
    '[]'::jsonb
  ) into result
  from public.columns;

  return result;
end $$;

create or replace function public.api_v1_tasks(
  p_token text,
  p_since timestamptz default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.api_tokens;
  result jsonb;
begin
  select * into tok from public.api_v1_auth(p_token);
  if tok.id is null then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  if not ('tasks:read' = any(tok.scopes)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.api_v1_touch(tok.id);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at), '[]'::jsonb)
  into result
  from (
    select id, title, description, column_id, position, due_at, start_at,
           priority, assignee_id, created_at, updated_at, deleted_at,
           external_source, external_id, is_private
    from public.tasks
    where p_since is null or updated_at > p_since
    order by updated_at asc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) t;

  return result;
end $$;

create or replace function public.api_v1_task(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.api_tokens;
  result public.tasks;
begin
  select * into tok from public.api_v1_auth(p_token);
  if tok.id is null then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  if not ('tasks:read' = any(tok.scopes)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.api_v1_touch(tok.id);

  select * into result from public.tasks where id = p_id;
  if result.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return to_jsonb(result);
end $$;

create or replace function public.api_v1_upsert_task(
  p_token text,
  p_source text,
  p_external_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.api_tokens;
  existing public.tasks;
  saved public.tasks;
  col_id uuid;
  remote_updated timestamptz;
  remote_deleted timestamptz;
  created boolean := false;
begin
  select * into tok from public.api_v1_auth(p_token);
  if tok.id is null then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  if not ('tasks:write' = any(tok.scopes)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_external_id, ''))) = 0 then
    raise exception 'external_id_required' using errcode = '22023';
  end if;
  if coalesce(p_source, '') !~ '^[a-z0-9_-]{1,40}$' then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  perform public.api_v1_touch(tok.id);

  remote_updated := coalesce(
    nullif(p_payload->>'updated_at', '')::timestamptz,
    now()
  );
  remote_deleted := nullif(p_payload->>'deleted_at', '')::timestamptz;

  select * into existing
  from public.tasks
  where external_id = p_external_id
  limit 1;

  -- Локальная задача, которую впервые публикуем во внешнюю систему:
  -- связываем по её id, чтобы не создать дубль.
  if existing.id is null
     and nullif(p_payload->>'id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select * into existing
    from public.tasks
    where id = (p_payload->>'id')::uuid;
  end if;

  -- Конфликт: локальная версия не старше — не перетираем её.
  if existing.id is not null
     and existing.external_id is not null
     and existing.updated_at >= remote_updated then
    return jsonb_build_object(
      'task', to_jsonb(existing),
      'created', false,
      'skipped', true
    );
  end if;

  if nullif(p_payload->>'column_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    col_id := (p_payload->>'column_id')::uuid;
  end if;

  if col_id is null and nullif(p_payload->>'column_title', '') is not null then
    select id into col_id
    from public.columns
    where lower(trim(title)) = lower(trim(p_payload->>'column_title'))
    limit 1;
  end if;

  if col_id is null then
    select id into col_id from public.columns order by position limit 1;
  end if;

  if existing.id is null then
    insert into public.tasks (
      title, description, column_id, position, created_by, is_private,
      due_at, start_at, priority, external_source, external_id,
      updated_at, deleted_at
    ) values (
      coalesce(nullif(trim(p_payload->>'title'), ''), 'Без названия'),
      coalesce(p_payload->>'description', ''),
      col_id,
      coalesce((select max(position) + 1 from public.tasks), 0),
      tok.created_by,
      false,
      nullif(p_payload->>'due_at', '')::timestamptz,
      nullif(p_payload->>'start_at', '')::timestamptz,
      coalesce((p_payload->>'priority')::integer, 0),
      p_source,
      p_external_id,
      remote_updated,
      remote_deleted
    )
    returning * into saved;

    created := true;
  else
    update public.tasks set
      title = coalesce(nullif(trim(p_payload->>'title'), ''), title),
      description = coalesce(p_payload->>'description', description),
      column_id = coalesce(col_id, column_id),
      due_at = case when p_payload ? 'due_at'
        then nullif(p_payload->>'due_at', '')::timestamptz else due_at end,
      start_at = case when p_payload ? 'start_at'
        then nullif(p_payload->>'start_at', '')::timestamptz else start_at end,
      priority = case when p_payload ? 'priority'
        then coalesce((p_payload->>'priority')::integer, 0) else priority end,
      deleted_at = case when p_payload ? 'deleted_at'
        then remote_deleted else deleted_at end,
      external_source = p_source,
      external_id = p_external_id,
      updated_at = remote_updated
    where id = existing.id
    returning * into saved;
  end if;

  return jsonb_build_object(
    'task', to_jsonb(saved),
    'created', created,
    'skipped', false
  );
end $$;

create or replace function public.api_v1_archive_task(
  p_token text,
  p_source text,
  p_external_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.api_tokens;
  saved public.tasks;
begin
  select * into tok from public.api_v1_auth(p_token);
  if tok.id is null then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  if not ('tasks:write' = any(tok.scopes)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.api_v1_touch(tok.id);

  update public.tasks
  set deleted_at = now()
  where external_source = p_source and external_id = p_external_id
  returning * into saved;

  if saved.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return to_jsonb(saved);
end $$;

-- API-функции доступны анонимному PostgREST-клиенту, но каждая проверяет токен.
revoke all on function public.create_api_token(text) from public, anon, authenticated;
revoke all on function public.list_api_tokens() from public, anon, authenticated;
revoke all on function public.revoke_api_token(uuid) from public, anon, authenticated;
revoke all on function public.api_v1_auth(text) from public, anon, authenticated;
revoke all on function public.api_v1_touch(uuid) from public, anon, authenticated;
revoke all on function public.api_v1_columns(text) from public, anon, authenticated;
revoke all on function public.api_v1_tasks(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.api_v1_task(text, uuid) from public, anon, authenticated;
revoke all on function public.api_v1_upsert_task(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.api_v1_archive_task(text, text, text) from public, anon, authenticated;

grant execute on function public.create_api_token(text) to authenticated;
grant execute on function public.list_api_tokens() to authenticated;
grant execute on function public.revoke_api_token(uuid) to authenticated;
grant execute on function public.api_v1_columns(text) to anon;
grant execute on function public.api_v1_tasks(text, timestamptz, integer) to anon;
grant execute on function public.api_v1_task(text, uuid) to anon;
grant execute on function public.api_v1_upsert_task(text, text, text, jsonb) to anon;
grant execute on function public.api_v1_archive_task(text, text, text) to anon;
