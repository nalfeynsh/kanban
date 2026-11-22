-- 037_secret_santa.sql
-- Отдельный модуль «Тайный Санта». Все таблицы имеют префикс secret_santa_.
-- Основные tasks/columns/profiles/projects не изменяются.

create table if not exists public.secret_santa_games (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  description text,
  rules text,
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  currency text not null default 'RUB',
  status text not null default 'draft'
    check (status in ('draft', 'collecting', 'drawn', 'completed', 'cancelled')),
  draw_at timestamptz,
  exchange_at timestamptz,
  drawn_at timestamptz,
  drawn_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_min >= 0),
  check (budget_max is null or budget_max >= 0),
  check (budget_min is null or budget_max is null or budget_min <= budget_max)
);

create index if not exists secret_santa_games_project_idx
  on public.secret_santa_games (project_id, created_at desc);

create table if not exists public.secret_santa_participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.secret_santa_games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  wishlist text,
  wishlist_url text,
  preferences text,
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create index if not exists secret_santa_participants_game_idx
  on public.secret_santa_participants (game_id);

create table if not exists public.secret_santa_exclusions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.secret_santa_games(id) on delete cascade,
  participant_a uuid not null references public.secret_santa_participants(id) on delete cascade,
  participant_b uuid not null references public.secret_santa_participants(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (participant_a < participant_b),
  unique (game_id, participant_a, participant_b)
);

create index if not exists secret_santa_exclusions_game_idx
  on public.secret_santa_exclusions (game_id);

create table if not exists public.secret_santa_assignments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.secret_santa_games(id) on delete cascade,
  giver_participant_id uuid not null references public.secret_santa_participants(id) on delete cascade,
  recipient_participant_id uuid not null references public.secret_santa_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, giver_participant_id),
  unique (game_id, recipient_participant_id),
  check (giver_participant_id <> recipient_participant_id)
);

create index if not exists secret_santa_assignments_game_idx
  on public.secret_santa_assignments (game_id);

-- ------------------------------------------------------------
-- Помощники доступа
-- ------------------------------------------------------------
create or replace function public.secret_santa_can_view(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.secret_santa_games g
    where g.id = p_game
      and (
        public.is_admin()
        or exists (
          select 1 from public.project_members m
          where m.project_id = g.project_id and m.profile_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.secret_santa_can_manage(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.secret_santa_games g
    where g.id = p_game and public.can_manage_project(g.project_id)
  );
$$;

grant execute on function public.secret_santa_can_view(uuid) to authenticated;
grant execute on function public.secret_santa_can_manage(uuid) to authenticated;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.secret_santa_games enable row level security;
alter table public.secret_santa_participants enable row level security;
alter table public.secret_santa_exclusions enable row level security;
alter table public.secret_santa_assignments enable row level security;

drop policy if exists secret_santa_games_select on public.secret_santa_games;
create policy secret_santa_games_select on public.secret_santa_games
  for select to authenticated
  using (public.secret_santa_can_view(id));

drop policy if exists secret_santa_participants_select on public.secret_santa_participants;
create policy secret_santa_participants_select on public.secret_santa_participants
  for select to authenticated
  using (public.secret_santa_can_view(game_id));

drop policy if exists secret_santa_exclusions_select on public.secret_santa_exclusions;
create policy secret_santa_exclusions_select on public.secret_santa_exclusions
  for select to authenticated
  using (public.secret_santa_can_manage(game_id));

drop policy if exists secret_santa_assignments_select_own on public.secret_santa_assignments;
create policy secret_santa_assignments_select_own on public.secret_santa_assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.secret_santa_participants p
      where p.id = giver_participant_id
        and p.game_id = game_id
        and p.user_id = auth.uid()
    )
  );

revoke all on public.secret_santa_games from authenticated;
revoke all on public.secret_santa_participants from authenticated;
revoke all on public.secret_santa_exclusions from authenticated;
revoke all on public.secret_santa_assignments from authenticated;
grant select on public.secret_santa_games to authenticated;
grant select on public.secret_santa_participants to authenticated;
grant select on public.secret_santa_exclusions to authenticated;
grant select on public.secret_santa_assignments to authenticated;

-- ------------------------------------------------------------
-- Создание / редактирование / удаление игры
-- ------------------------------------------------------------
create or replace function public.secret_santa_create_game(
  p_project_id uuid,
  p_title text,
  p_description text default null,
  p_rules text default null,
  p_budget_min numeric default null,
  p_budget_max numeric default null,
  p_currency text default 'RUB',
  p_draw_at timestamptz default null,
  p_exchange_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'secret_santa_not_authenticated' using errcode = '42501';
  end if;
  if not public.can_manage_project(p_project_id) then
    raise exception 'secret_santa_manager_required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'secret_santa_title_required' using errcode = '22023';
  end if;
  if p_budget_min is not null and p_budget_min < 0 then
    raise exception 'secret_santa_budget_invalid' using errcode = '22023';
  end if;
  if p_budget_max is not null and p_budget_max < 0 then
    raise exception 'secret_santa_budget_invalid' using errcode = '22023';
  end if;
  if p_budget_min is not null and p_budget_max is not null and p_budget_min > p_budget_max then
    raise exception 'secret_santa_budget_range_invalid' using errcode = '22023';
  end if;

  insert into public.secret_santa_games (
    project_id, title, description, rules, budget_min, budget_max,
    currency, draw_at, exchange_at, created_by
  )
  values (
    p_project_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_rules, '')), ''), p_budget_min, p_budget_max,
    coalesce(nullif(btrim(p_currency), ''), 'RUB'), p_draw_at, p_exchange_at, auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.secret_santa_update_game(
  p_game_id uuid,
  p_title text,
  p_description text default null,
  p_rules text default null,
  p_budget_min numeric default null,
  p_budget_max numeric default null,
  p_currency text default 'RUB',
  p_draw_at timestamptz default null,
  p_exchange_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.secret_santa_can_manage(p_game_id) then
    raise exception 'secret_santa_manager_required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'secret_santa_title_required' using errcode = '22023';
  end if;
  if p_budget_min is not null and p_budget_min < 0 then
    raise exception 'secret_santa_budget_invalid' using errcode = '22023';
  end if;
  if p_budget_max is not null and p_budget_max < 0 then
    raise exception 'secret_santa_budget_invalid' using errcode = '22023';
  end if;
  if p_budget_min is not null and p_budget_max is not null and p_budget_min > p_budget_max then
    raise exception 'secret_santa_budget_range_invalid' using errcode = '22023';
  end if;

  update public.secret_santa_games
  set title = btrim(p_title),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      rules = nullif(btrim(coalesce(p_rules, '')), ''),
      budget_min = p_budget_min,
      budget_max = p_budget_max,
      currency = coalesce(nullif(btrim(p_currency), ''), 'RUB'),
      draw_at = p_draw_at,
      exchange_at = p_exchange_at,
      updated_at = now()
  where id = p_game_id;
end $$;

create or replace function public.secret_santa_delete_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.secret_santa_can_manage(p_game_id) then
    raise exception 'secret_santa_manager_required' using errcode = '42501';
  end if;
  delete from public.secret_santa_games where id = p_game_id;
end $$;

create or replace function public.secret_santa_set_status(p_game_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.secret_santa_can_manage(p_game_id) then
    raise exception 'secret_santa_manager_required' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'collecting', 'cancelled', 'completed') then
    raise exception 'secret_santa_status_invalid' using errcode = '22023';
  end if;
  update public.secret_santa_games
  set status = p_status, updated_at = now()
  where id = p_game_id;
end $$;

-- ------------------------------------------------------------
-- Участие и пожелания
-- ------------------------------------------------------------
create or replace function public.secret_santa_join(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
  v_project uuid;
begin
  select status, project_id into v_status, v_project
  from public.secret_santa_games where id = p_game_id;
  if v_status is null then
    raise exception 'secret_santa_game_not_found' using errcode = 'P0002';
  end if;
  if not public.is_project_member(v_project) then
    raise exception 'secret_santa_project_member_required' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'collecting') then
    raise exception 'secret_santa_join_closed' using errcode = '22023';
  end if;

  insert into public.secret_santa_participants (game_id, user_id)
  values (p_game_id, auth.uid())
  on conflict (game_id, user_id) do update set user_id = excluded.user_id
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.secret_santa_leave(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.secret_santa_games where id = p_game_id;
  if v_status is null then
    raise exception 'secret_santa_game_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'drawn' then
    raise exception 'secret_santa_leave_after_draw' using errcode = '22023';
  end if;
  delete from public.secret_santa_participants
  where game_id = p_game_id and user_id = auth.uid();
end $$;

create or replace function public.secret_santa_save_wishlist(
  p_game_id uuid,
  p_wishlist text default null,
  p_wishlist_url text default null,
  p_preferences text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.secret_santa_participants
  set wishlist = nullif(btrim(coalesce(p_wishlist, '')), ''),
      wishlist_url = nullif(btrim(coalesce(p_wishlist_url, '')), ''),
      preferences = nullif(btrim(coalesce(p_preferences, '')), '')
  where game_id = p_game_id and user_id = auth.uid();
  if not found then
    raise exception 'secret_santa_participant_required' using errcode = '42501';
  end if;
end $$;

-- ------------------------------------------------------------
-- Исключения
-- ------------------------------------------------------------
create or replace function public.secret_santa_add_exclusion(
  p_game_id uuid,
  p_participant_a uuid,
  p_participant_b uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid := least(p_participant_a, p_participant_b);
  v_b uuid := greatest(p_participant_a, p_participant_b);
  v_id uuid;
begin
  if not public.secret_santa_can_manage(p_game_id) then
    raise exception 'secret_santa_manager_required' using errcode = '42501';
  end if;
  if v_a = v_b then
    raise exception 'secret_santa_exclusion_self' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.secret_santa_participants
    where game_id = p_game_id and id = v_a
  ) or not exists (
    select 1 from public.secret_santa_participants
    where game_id = p_game_id and id = v_b
  ) then
    raise exception 'secret_santa_participant_not_found' using errcode = 'P0002';
  end if;

  insert into public.secret_santa_exclusions (
    game_id, participant_a, participant_b, created_by
  )
  values (p_game_id, v_a, v_b, auth.uid())
  on conflict (game_id, participant_a, participant_b) do update
    set participant_a = excluded.participant_a
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.secret_santa_remove_exclusion(p_exclusion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game uuid;
begin
  select game_id into v_game from public.secret_santa_exclusions where id = p_exclusion_id;
  if v_game is null then
    return;
  end if;
  if not public.secret_santa_can_manage(v_game) then
    raise exception 'secret_santa_manager_required' using errcode = '42501';
  end if;
  delete from public.secret_santa_exclusions where id = p_exclusion_id;
end $$;

-- ------------------------------------------------------------
-- Жеребьёвка: только на сервере, пары не отдаются организатору
-- ------------------------------------------------------------
create or replace function public.secret_santa_draw(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_n integer;
  v_givers uuid[];
  v_recipients uuid[];
  v_attempt integer;
  v_ok boolean;
  v_i integer;
  v_j integer;
  v_tmp uuid;
begin
  if not public.secret_santa_can_manage(p_game_id) then
    raise exception 'secret_santa_manager_required' using errcode = '42501';
  end if;

  select status into v_status from public.secret_santa_games
  where id = p_game_id
  for update;
  if v_status is null then
    raise exception 'secret_santa_game_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'collecting') then
    raise exception 'secret_santa_draw_closed' using errcode = '22023';
  end if;

  select array_agg(id order by joined_at, id) into v_givers
  from public.secret_santa_participants where game_id = p_game_id;
  v_n := coalesce(array_length(v_givers, 1), 0);
  if v_n < 3 then
    raise exception 'secret_santa_min_participants' using errcode = '22023';
  end if;

  v_ok := false;
  for v_attempt in 1..2000 loop
    v_recipients := v_givers;
    for v_i in reverse v_n..2 loop
      v_j := 1 + floor(random() * v_i)::integer;
      v_tmp := v_recipients[v_i];
      v_recipients[v_i] := v_recipients[v_j];
      v_recipients[v_j] := v_tmp;
    end loop;

    v_ok := true;
    for v_i in 1..v_n loop
      if v_givers[v_i] = v_recipients[v_i] then
        v_ok := false;
        exit;
      end if;
      if exists (
        select 1 from public.secret_santa_exclusions e
        where e.game_id = p_game_id
          and (
            (e.participant_a = v_givers[v_i] and e.participant_b = v_recipients[v_i])
            or (e.participant_a = v_recipients[v_i] and e.participant_b = v_givers[v_i])
          )
      ) then
        v_ok := false;
        exit;
      end if;
    end loop;
    if v_ok then
      exit;
    end if;
  end loop;

  if not v_ok then
    raise exception 'secret_santa_draw_impossible' using errcode = '22023';
  end if;

  delete from public.secret_santa_assignments where game_id = p_game_id;
  insert into public.secret_santa_assignments (game_id, giver_participant_id, recipient_participant_id)
  select p_game_id, v_givers[s.i], v_recipients[s.i]
  from generate_subscripts(v_givers, 1) as s(i);

  update public.secret_santa_games
  set status = 'drawn', drawn_at = now(), drawn_by = auth.uid(), updated_at = now()
  where id = p_game_id;

  insert into public.notifications (
    user_id, kind, title, body, entity_type, entity_id, project_id, dedupe_key
  )
  select
    p.user_id,
    'secret_santa',
    U&'\0422\0430\0439\043D\044B\0439\0020\0421\0430\043D\0442\0430\003A\0020\0436\0435\0440\0435\0431\044C\0451\0432\043A\0430\0020\043F\0440\043E\0432\0435\0434\0435\043D\0430',
    g.title,
    'secret_santa_game',
    g.id,
    g.project_id,
    'secret_santa:' || g.id || ':' || p.id
  from public.secret_santa_participants p
  join public.secret_santa_games g on g.id = p.game_id
  where p.game_id = p_game_id
  on conflict (user_id, dedupe_key) do nothing;

  return jsonb_build_object('ok', true, 'participants', v_n);
end $$;

create or replace function public.secret_santa_my_assignment(p_game_id uuid)
returns table (
  recipient_user_id uuid,
  recipient_name text,
  recipient_avatar_url text,
  recipient_color text,
  wishlist text,
  wishlist_url text,
  preferences text,
  budget_min numeric,
  budget_max numeric,
  currency text,
  exchange_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_status text;
begin
  select g.status into v_status
  from public.secret_santa_games g
  join public.secret_santa_participants p
    on p.game_id = g.id and p.user_id = auth.uid()
  where g.id = p_game_id;

  if v_status is distinct from 'drawn' then
    return;
  end if;

  select p.id into v_me
  from public.secret_santa_participants p
  where p.game_id = p_game_id and p.user_id = auth.uid();

  if v_me is null then
    return;
  end if;

  return query
  select rp.user_id,
         pr.full_name,
         pr.avatar_url,
         pr.color,
         rp.wishlist,
         rp.wishlist_url,
         rp.preferences,
         g.budget_min,
         g.budget_max,
         g.currency,
         g.exchange_at
  from public.secret_santa_assignments a
  join public.secret_santa_participants rp on rp.id = a.recipient_participant_id
  join public.profiles pr on pr.id = rp.user_id
  join public.secret_santa_games g on g.id = a.game_id
  where a.game_id = p_game_id and a.giver_participant_id = v_me;
end $$;

-- ------------------------------------------------------------
-- Права на функции
-- ------------------------------------------------------------
revoke all on function public.secret_santa_create_game(uuid, text, text, text, numeric, numeric, text, timestamptz, timestamptz) from public;
revoke all on function public.secret_santa_update_game(uuid, text, text, text, numeric, numeric, text, timestamptz, timestamptz) from public;
revoke all on function public.secret_santa_delete_game(uuid) from public;
revoke all on function public.secret_santa_set_status(uuid, text) from public;
revoke all on function public.secret_santa_join(uuid) from public;
revoke all on function public.secret_santa_leave(uuid) from public;
revoke all on function public.secret_santa_save_wishlist(uuid, text, text, text) from public;
revoke all on function public.secret_santa_add_exclusion(uuid, uuid, uuid) from public;
revoke all on function public.secret_santa_remove_exclusion(uuid) from public;
revoke all on function public.secret_santa_draw(uuid) from public;
revoke all on function public.secret_santa_my_assignment(uuid) from public;

grant execute on function public.secret_santa_create_game(uuid, text, text, text, numeric, numeric, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.secret_santa_update_game(uuid, text, text, text, numeric, numeric, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.secret_santa_delete_game(uuid) to authenticated;
grant execute on function public.secret_santa_set_status(uuid, text) to authenticated;
grant execute on function public.secret_santa_join(uuid) to authenticated;
grant execute on function public.secret_santa_leave(uuid) to authenticated;
grant execute on function public.secret_santa_save_wishlist(uuid, text, text, text) to authenticated;
grant execute on function public.secret_santa_add_exclusion(uuid, uuid, uuid) to authenticated;
grant execute on function public.secret_santa_remove_exclusion(uuid) to authenticated;
grant execute on function public.secret_santa_draw(uuid) to authenticated;
grant execute on function public.secret_santa_my_assignment(uuid) to authenticated;

-- ------------------------------------------------------------
-- Feature flag
-- ------------------------------------------------------------
insert into public.feature_flags (key, name, description, enabled, min_plan, sort_order)
values (
  'secret_santa',
  'Тайный Санта',
  'Обмен подарками внутри проекта: участники, пожелания, бюджет от/до и жеребьёвка',
  true,
  'free',
  80
)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      min_plan = excluded.min_plan,
      sort_order = excluded.sort_order;
