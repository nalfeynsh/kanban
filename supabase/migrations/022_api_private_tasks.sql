-- 022_api_private_tasks.sql
-- Закрывает API v1 доступ к личным задачам.
-- API предназначен только для командных задач: is_private = true не отдаётся,
-- не обновляется и не архивируется через внешний токен.

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
    where (p_since is null or updated_at > p_since)
      and coalesce(is_private, false) = false
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

  select * into result
  from public.tasks
  where id = p_id
    and coalesce(is_private, false) = false;

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
  payload_id uuid;
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

  if nullif(p_payload->>'id', '') ~ '^[0-9a-fA-F-]{36}$' then
    payload_id := (p_payload->>'id')::uuid;
  end if;

  -- Личная задача не должна приниматься ни по external_id, ни по локальному id.
  if exists (
    select 1 from public.tasks
    where external_id = p_external_id
      and coalesce(is_private, false) = true
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if payload_id is not null and exists (
    select 1 from public.tasks
    where id = payload_id
      and coalesce(is_private, false) = true
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into existing
  from public.tasks
  where external_id = p_external_id
    and coalesce(is_private, false) = false
  limit 1;

  -- Локальная задача, которую впервые публикуем во внешнюю систему:
  -- связываем по её id, чтобы не создать дубль.
  if existing.id is null and payload_id is not null then
    select * into existing
    from public.tasks
    where id = payload_id
      and coalesce(is_private, false) = false;
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
      and coalesce(is_private, false) = false
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
  where external_source = p_source
    and external_id = p_external_id
    and coalesce(is_private, false) = false
  returning * into saved;

  if saved.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return to_jsonb(saved);
end $$;

revoke all on function public.api_v1_tasks(text, timestamptz, integer) from public;
revoke all on function public.api_v1_task(text, uuid) from public;
revoke all on function public.api_v1_upsert_task(text, text, text, jsonb) from public;
revoke all on function public.api_v1_archive_task(text, text, text) from public;
grant execute on function public.api_v1_tasks(text, timestamptz, integer) to anon;
grant execute on function public.api_v1_task(text, uuid) to anon;
grant execute on function public.api_v1_upsert_task(text, text, text, jsonb) to anon;
grant execute on function public.api_v1_archive_task(text, text, text) to anon;

comment on function public.api_v1_tasks(text, timestamptz, integer) is
  'API v1: только командные задачи; is_private не отдаются.';
comment on function public.api_v1_task(text, uuid) is
  'API v1: личная задача возвращает not_found.';
comment on function public.api_v1_upsert_task(text, text, text, jsonb) is
  'API v1: upsert только для командных задач; личные не изменяются.';
comment on function public.api_v1_archive_task(text, text, text) is
  'API v1: архивирование только командных задач.';
