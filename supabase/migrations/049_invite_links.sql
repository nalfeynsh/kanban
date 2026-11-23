-- 049: безопасная ссылка-приглашение и упрощённая регистрация
-- RPC отдаёт только почту и признак кода, не раскрывая сам код.

create or replace function public.get_invite(p_id uuid)
returns table (
  email text,
  code_required boolean,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.email,
    (i.code is not null and btrim(i.code) <> '') as code_required,
    i.expires_at
  from public.invites i
  where i.id = p_id
    and i.used_at is null
    and (i.expires_at is null or i.expires_at > now());
$$;

grant execute on function public.get_invite(uuid) to anon, authenticated;
