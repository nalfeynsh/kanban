
update public.roles set name = U&'\0420\0443\043A\043E\0432\043E\0434\0438\0442\0435\043B\044C' where key = 'manager';
update public.roles set name = U&'\0417\0430\043C \0440\0443\043A\043E\0432\043E\0434\0438\0442\0435\043B\044F' where key = 'deputy';

create or replace function public.secret_santa_join(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
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
    auth.uid(), 'secret_santa', U&'\0412\044B \0443\0447\0430\0441\0442\0432\0443\0435\0442\0435 \0432 \0422\0430\0439\043D\043E\043C \0421\0430\043D\0442\0435',
    U&'\0417\0430\044F\0432\043A\0430 \043F\0440\0438\043D\044F\0442\0430. \041F\043E\0436\0435\043B\0430\043D\0438\044F \043C\043E\0436\043D\043E \0438\0437\043C\0435\043D\0438\0442\044C \0434\043E \0436\0435\0440\0435\0431\044C\0451\0432\043A\0438.',
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
    raise exception 'secret_santa_self_invite' using errcode = '22023';
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
    p_user_id, 'secret_santa', U&'\041F\0440\0438\0433\043B\0430\0448\0435\043D\0438\0435 \0432 \0422\0430\0439\043D\044B\0439 \0421\0430\043D\0442\0430',
    U&'\0412\0430\0441 \043F\0440\0438\0433\043B\0430\0441\0438\043B\0438 \0432 \0438\0433\0440\0443 \00AB' || v_title || U&'\00BB. \041F\0440\0438\043C\0438\0442\0435 \0438\043B\0438 \043E\0442\043A\043B\043E\043D\0438\0442\0435 \043F\0440\0438\0433\043B\0430\0448\0435\043D\0438\0435.',
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
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation_already_processed' using errcode = '22023';
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
    case when p_accept then U&'\041F\0440\0438\0433\043B\0430\0448\0435\043D\0438\0435 \043F\0440\0438\043D\044F\0442\043E' else U&'\041F\0440\0438\0433\043B\0430\0448\0435\043D\0438\0435 \043E\0442\043A\043B\043E\043D\0435\043D\043E' end,
    U&'\0418\0433\0440\0430 \00AB' || coalesce(v_title, U&'\0422\0430\0439\043D\044B\0439 \0421\0430\043D\0442\0430') || U&'\00BB.',
    'secret_santa', v_inv.game_id,
    'secret_santa:response:' || p_invitation_id || ':' || case when p_accept then 'accepted' else 'declined' end
  )
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

create or replace function public.request_permission(p_context text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select coalesce(full_name, U&'\0421\043E\0442\0440\0443\0434\043D\0438\043A') into v_name
  from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, kind, title, body, entity_type, dedupe_key)
  select p.id,
         'permission_request',
         U&'\0417\0430\043F\0440\043E\0441 \043F\0440\0430\0432',
         v_name || U&' \043F\0440\043E\0441\0438\0442 \0434\043E\0441\0442\0443\043F: ' || left(coalesce(p_context, U&'\043D\0443\0436\0435\043D \0434\043E\0441\0442\0443\043F \043A \0444\0443\043D\043A\0446\0438\0438'), 300),
         'permission_request',
         'permission_request:' || auth.uid() || ':' || to_char(now(), 'YYYY-MM-DD')
  from public.profiles p
  where p.id <> auth.uid()
    and p.deleted_at is null
    and p.role in ('admin', 'manager', 'deputy')
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

update public.notifications n
set title = U&'\0412\044B \0443\0447\0430\0441\0442\0432\0443\0435\0442\0435 \0432 \0422\0430\0439\043D\043E\043C \0421\0430\043D\0442\0435',
    body = U&'\0417\0430\044F\0432\043A\0430 \043F\0440\0438\043D\044F\0442\0430. \041F\043E\0436\0435\043B\0430\043D\0438\044F \043C\043E\0436\043D\043E \0438\0437\043C\0435\043D\0438\0442\044C \0434\043E \0436\0435\0440\0435\0431\044C\0451\0432\043A\0438.'
where n.kind = 'secret_santa'
  and n.dedupe_key like 'secret_santa:joined:%';

update public.notifications n
set title = U&'\041F\0440\0438\0433\043B\0430\0448\0435\043D\0438\0435 \0432 \0422\0430\0439\043D\044B\0439 \0421\0430\043D\0442\0430',
    body = U&'\0412\0430\0441 \043F\0440\0438\0433\043B\0430\0441\0438\043B\0438 \0432 \0438\0433\0440\0443 \00AB' || coalesce(
      (select g.title from public.secret_santa_games g where g.id = n.entity_id),
      U&'\0422\0430\0439\043D\044B\0439 \0421\0430\043D\0442\0430'
    ) || U&'\00BB. \041F\0440\0438\043C\0438\0442\0435 \0438\043B\0438 \043E\0442\043A\043B\043E\043D\0438\0442\0435 \043F\0440\0438\0433\043B\0430\0448\0435\043D\0438\0435.'
where n.kind = 'secret_santa'
  and n.dedupe_key like 'secret_santa:invite:%';

update public.notifications n
set title = case
      when n.dedupe_key like '%:accepted' then U&'\041F\0440\0438\0433\043B\0430\0448\0435\043D\0438\0435 \043F\0440\0438\043D\044F\0442\043E'
      else U&'\041F\0440\0438\0433\043B\0430\0448\0435\043D\0438\0435 \043E\0442\043A\043B\043E\043D\0435\043D\043E'
    end,
    body = U&'\0418\0433\0440\0430 \00AB' || coalesce(
      (select g.title from public.secret_santa_games g where g.id = n.entity_id),
      U&'\0422\0430\0439\043D\044B\0439 \0421\0430\043D\0442\0430'
    ) || U&'\00BB.'
where n.kind = 'secret_santa'
  and n.dedupe_key like 'secret_santa:response:%';

update public.notifications
set title = U&'\0417\0430\043F\0440\043E\0441 \043F\0440\0430\0432'
where kind = 'permission_request';

grant execute on function public.secret_santa_join(uuid) to authenticated;
grant execute on function public.secret_santa_invite(uuid, uuid) to authenticated;
grant execute on function public.secret_santa_respond_invitation(uuid, boolean) to authenticated;
grant execute on function public.request_permission(text) to authenticated;