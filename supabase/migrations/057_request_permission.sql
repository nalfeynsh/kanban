-- 057: запрос прав у руководителя из интерфейса

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

  select coalesce(full_name, 'Сотрудник') into v_name
  from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, kind, title, body, entity_type, dedupe_key)
  select p.id,
         'permission_request',
         'Запрос прав',
         v_name || ' просит доступ: ' || left(coalesce(p_context, 'нужен доступ к функции'), 300),
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

grant execute on function public.request_permission(text) to authenticated;
