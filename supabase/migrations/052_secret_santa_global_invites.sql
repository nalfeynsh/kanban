-- 052: РўР°Р№РЅС‹Р№ РЎР°РЅС‚Р° Р±РµР· РїСЂРёРІСЏР·РєРё Рє РїСЂРѕРµРєС‚Сѓ, РѕС‚РІРµС‚СЃС‚РІРµРЅРЅС‹Р№, РїСЂРёРіР»Р°С€РµРЅРёСЏ Рё СѓРІРµРґРѕРјР»РµРЅРёСЏ

alter table public.secret_santa_games
  alter column project_id drop not null;

alter table public.secret_santa_games
  add column if not exists manager_id uuid references public.profiles(id) on delete set null;

update public.secret_santa_games
   set manager_id = created_by
 where manager_id is null;

create table if not exists public.secret_santa_invitations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.secret_santa_games(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (game_id, invitee_id)
);

create index if not exists secret_santa_invitations_invitee_idx
  on public.secret_santa_invitations (invitee_id, status, created_at desc);

alter table public.secret_santa_invitations enable row level security;

drop policy if exists secret_santa_games_select on public.secret_santa_games;
create policy secret_santa_games_select on public.secret_santa_games
  for select to authenticated using (auth.uid() is not null);

drop policy if exists secret_santa_participants_select on public.secret_santa_participants;
create policy secret_santa_participants_select on public.secret_santa_participants
  for select to authenticated using (auth.uid() is not null);

drop policy if exists secret_santa_invitations_select on public.secret_santa_invitations;
create policy secret_santa_invitations_select on public.secret_santa_invitations
  for select to authenticated
  using (invitee_id = auth.uid() or inviter_id = auth.uid());

create or replace function public.secret_santa_can_view(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.secret_santa_games g where g.id = p_game);
$$;

create or replace function public.secret_santa_can_manage(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.secret_santa_games g
      where g.id = p_game
        and (
          g.manager_id = auth.uid()
          or g.created_by = auth.uid()
          or public.current_role() in ('admin', 'manager', 'deputy')
        )
    );
$$;

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
    currency, draw_at, exchange_at, created_by, manager_id
  ) values (
    null, btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_rules, '')), ''),
    p_budget_min, p_budget_max,
    coalesce(nullif(btrim(p_currency), ''), 'RUB'),
    p_draw_at, p_exchange_at, auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.secret_santa_delete_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role();
begin
  if auth.uid() is null then
    raise exception 'secret_santa_not_authenticated' using errcode = '42501';
  end if;
  if v_role not in ('admin', 'manager', 'deputy') then
    raise exception 'secret_santa_manager_required' using errcode = '42501';
  end if;
  delete from public.secret_santa_games where id = p_game_id;
  if not found then
    raise exception 'secret_santa_game_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.secret_santa_join(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'secret_santa_not_authenticated' using errcode = '42501';
  end if;
  select status into v_status from public.secret_santa_games where id = p_game_id;
  if v_status is null then
    raise exception 'secret_santa_game_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'collecting') then
    raise exception 'secret_santa_join_closed' using errcode = '22023';
  end if;

  insert into public.secret_santa_participants (game_id, user_id)
  values (p_game_id, auth.uid())
  on conflict (game_id, user_id) do update set joined_at = now()
  returning id into v_id;

  insert into public.notifications (user_id, kind, title, body, entity_type, entity_id, dedupe_key)
  values (
    auth.uid(), 'secret_santa', 'Р’С‹ СѓС‡Р°СЃС‚РІСѓРµС‚Рµ РІ РўР°Р№РЅРѕРј РЎР°РЅС‚Рµ',
    'Р—Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р°. РџРѕР¶РµР»Р°РЅРёСЏ РјРѕР¶РЅРѕ РёР·РјРµРЅРёС‚СЊ РґРѕ Р¶РµСЂРµР±СЊС‘РІРєРё.',
    'secret_santa', p_game_id, 'secret_santa:joined:' || p_game_id || ':' || auth.uid()
  )
  on conflict (user_id, dedupe_key) do nothing;

  return v_id;
end;
$$;

create or replace function public.secret_santa_invite(p_game_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'secret_santa_not_authenticated' using errcode = '42501';
  end if;
  if not public.secret_santa_can_manage(p_game_id) then
    raise exception 'secret_santa_manager_required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'РќРµР»СЊР·СЏ РїСЂРёРіР»Р°СЃРёС‚СЊ СЃР°РјРѕРіРѕ СЃРµР±СЏ' using errcode = '22023';
  end if;
  select title into v_title from public.secret_santa_games where id = p_game_id;
  if v_title is null then
    raise exception 'secret_santa_game_not_found' using errcode = 'P0002';
  end if;

  insert into public.secret_santa_invitations (game_id, inviter_id, invitee_id)
  values (p_game_id, auth.uid(), p_user_id)
  on conflict (game_id, invitee_id) do update
    set status = case when public.secret_santa_invitations.status = 'declined' then 'pending' else public.secret_santa_invitations.status end,
        inviter_id = auth.uid(),
        created_at = case when public.secret_santa_invitations.status = 'declined' then now() else public.secret_santa_invitations.created_at end,
        responded_at = case when public.secret_santa_invitations.status = 'declined' then null else public.secret_santa_invitations.responded_at end
  returning id into v_id;

  insert into public.notifications (user_id, kind, title, body, entity_type, entity_id, dedupe_key)
  values (
    p_user_id, 'secret_santa', 'РџСЂРёРіР»Р°С€РµРЅРёРµ РІ РўР°Р№РЅС‹Р№ РЎР°РЅС‚Р°',
    'Р’Р°СЃ РїСЂРёРіР»Р°СЃРёР»Рё РІ РёРіСЂСѓ В«' || v_title || 'В». РџСЂРёРјРёС‚Рµ РёР»Рё РѕС‚РєР»РѕРЅРёС‚Рµ РїСЂРёРіР»Р°С€РµРЅРёРµ.',
    'secret_santa', p_game_id, 'secret_santa:invite:' || v_id || ':' || p_user_id
  )
  on conflict (user_id, dedupe_key) do nothing;

  return v_id;
end;
$$;

create or replace function public.secret_santa_respond_invitation(p_invitation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.secret_santa_invitations%rowtype;
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'secret_santa_not_authenticated' using errcode = '42501';
  end if;
  select * into v_inv from public.secret_santa_invitations where id = p_invitation_id;
  if not found or v_inv.invitee_id <> auth.uid() then
    raise exception 'РџСЂРёРіР»Р°С€РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'РџСЂРёРіР»Р°С€РµРЅРёРµ СѓР¶Рµ РѕР±СЂР°Р±РѕС‚Р°РЅРѕ' using errcode = '22023';
  end if;

  update public.secret_santa_invitations
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_invitation_id;

  if p_accept then
    insert into public.secret_santa_participants (game_id, user_id)
    values (v_inv.game_id, auth.uid())
    on conflict (game_id, user_id) do nothing;
  end if;

  select title into v_title from public.secret_santa_games where id = v_inv.game_id;
  insert into public.notifications (user_id, kind, title, body, entity_type, entity_id, dedupe_key)
  values (
    v_inv.inviter_id, 'secret_santa',
    case when p_accept then 'РџСЂРёРіР»Р°С€РµРЅРёРµ РїСЂРёРЅСЏС‚Рѕ' else 'РџСЂРёРіР»Р°С€РµРЅРёРµ РѕС‚РєР»РѕРЅРµРЅРѕ' end,
    'РРіСЂР° В«' || coalesce(v_title, 'РўР°Р№РЅС‹Р№ РЎР°РЅС‚Р°') || 'В».',
    'secret_santa', v_inv.game_id,
    'secret_santa:response:' || p_invitation_id || ':' || case when p_accept then 'accepted' else 'declined' end
  )
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

grant execute on function public.secret_santa_create_game(uuid, text, text, text, numeric, numeric, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.secret_santa_delete_game(uuid) to authenticated;
grant execute on function public.secret_santa_join(uuid) to authenticated;
grant execute on function public.secret_santa_invite(uuid, uuid) to authenticated;
grant execute on function public.secret_santa_respond_invitation(uuid, boolean) to authenticated;
