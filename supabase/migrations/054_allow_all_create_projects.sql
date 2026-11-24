-- 054: любой авторизованный сотрудник может создать своё проектное направление

create or replace function public.create_project(
  p_name text,
  p_description text,
  p_columns jsonb,
  p_members jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_owner uuid := auth.uid();
  v_member record;
  v_column record;
  v_count integer;
begin
  if v_owner is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'project_name_required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_columns) <> 'array' or jsonb_array_length(p_columns) = 0 then
    raise exception 'project_columns_required' using errcode = '22023';
  end if;

  if jsonb_array_length(p_columns) > 20 then
    raise exception 'too_many_project_columns' using errcode = '22023';
  end if;

  insert into public.projects (name, description, owner_id)
  values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), v_owner)
  returning id into v_project;

  insert into public.project_members (project_id, profile_id, role)
  values (v_project, v_owner, 'owner')
  on conflict do nothing;

  if jsonb_typeof(p_members) = 'array' then
    for v_member in select * from jsonb_to_recordset(p_members) as x(profile_id uuid, role text)
    loop
      if v_member.profile_id is not null
         and v_member.profile_id <> v_owner
         and v_member.role in ('manager', 'member') then
        insert into public.project_members (project_id, profile_id, role)
        values (v_project, v_member.profile_id, v_member.role)
        on conflict (project_id, profile_id) do update set role = excluded.role;
      end if;
    end loop;
  end if;

  for v_column in
    select btrim(elem->>'title') as title,
           nullif(elem->>'responsible_id', '')::uuid as responsible_id,
           ord
    from jsonb_array_elements(p_columns) with ordinality as t(elem, ord)
  loop
    if length(btrim(coalesce(v_column.title, ''))) > 0 then
      insert into public.columns (project_id, title, position, responsible_id)
      values (v_project, btrim(v_column.title), v_column.ord, v_column.responsible_id);
    end if;
  end loop;

  select count(*) into v_count from public.columns where project_id = v_project;
  if v_count = 0 then
    raise exception 'project_columns_required' using errcode = '22023';
  end if;

  return v_project;
end;
$$;
