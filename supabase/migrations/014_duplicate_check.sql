-- 014_duplicate_check.sql
-- Мягкая проверка похожих задач при создании.
-- Лексическая близость: pg_trgm + русский полнотекстовый поиск.

create extension if not exists pg_trgm with schema extensions;

create index if not exists tasks_title_trgm_idx
  on public.tasks using gin (title extensions.gin_trgm_ops)
  where deleted_at is null and is_private = false;

create or replace function public.find_similar_tasks(
  p_title text,
  p_description text default '',
  p_exclude_id uuid default null,
  p_limit integer default 5
)
returns table (
  id uuid,
  title text,
  column_id uuid,
  column_title text,
  assignee_id uuid,
  score numeric,
  reason text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
with params as (
  select
    btrim(regexp_replace(lower(coalesce(p_title, '')), '[^a-zа-яё0-9]+', ' ', 'g')) as q_title,
    btrim(regexp_replace(
      lower(coalesce(p_title, '') || ' ' || regexp_replace(coalesce(p_description, ''), '<[^>]+>', ' ', 'g')),
      '[^a-zа-яё0-9]+',
      ' ',
      'g'
    )) as q_content
),
candidates as (
  select
    t.id,
    t.title,
    t.column_id,
    t.assignee_id,
    c.title as column_title,
    btrim(regexp_replace(lower(t.title), '[^a-zа-яё0-9]+', ' ', 'g')) as n_title,
    btrim(regexp_replace(
      lower(coalesce(t.title, '') || ' ' || regexp_replace(coalesce(t.description, ''), '<[^>]+>', ' ', 'g')),
      '[^a-zа-яё0-9]+',
      ' ',
      'g'
    )) as n_content
  from public.tasks t
  left join public.columns c on c.id = t.column_id
  where t.deleted_at is null
    and t.is_private = false
    -- Автоматически созданные копии повторяющихся задач не считаем дублями
    and t.recurrence_parent_id is null
    and (p_exclude_id is null or t.id <> p_exclude_id)
),
scored as (
  select
    candidates.*,
    greatest(
      similarity(candidates.n_title, params.q_title),
      similarity(candidates.n_content, params.q_content)
    )::numeric as base_score
  from candidates
  cross join params
)
select
  scored.id,
  scored.title,
  scored.column_id,
  scored.column_title,
  scored.assignee_id,
  round(
    least(
      1,
      scored.base_score
        + case
            when to_tsvector('russian', scored.n_title || ' ' || scored.n_content)
                 @@ plainto_tsquery('russian', (select q_content from params))
            then 0.08
            else 0
          end
    )::numeric,
    3
  ) as score,
  case
    when similarity(scored.n_title, (select q_title from params)) >= 0.55 then 'title'
    when similarity(scored.n_content, (select q_content from params)) >= 0.42 then 'content'
    else 'text'
  end as reason
from scored
where scored.base_score >= 0.38
order by scored.base_score desc, scored.title asc
limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

revoke all on function public.find_similar_tasks(text, text, uuid, integer) from public;
revoke execute on function public.find_similar_tasks(text, text, uuid, integer) from anon;
grant execute on function public.find_similar_tasks(text, text, uuid, integer) to authenticated;

comment on function public.find_similar_tasks(text, text, uuid, integer) is
  'Похожие активные командные задачи для предупреждения о дубле при создании.';
