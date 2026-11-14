-- 030_feature_flags.sql
-- Функциональные флаги: включение/выключение крупных модулей интерфейса.
-- Менять может только администратор; читать — все авторизованные.

create table if not exists public.feature_flags (
  key text primary key,
  name text not null,
  description text,
  enabled boolean not null default true,
  min_plan text not null default 'free',
  sort_order integer not null default 100,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, name, description, enabled, min_plan, sort_order)
values
  ('projects', 'Проекты', 'Выбор и создание проектов, рабочие группы', true, 'free', 10),
  ('meetings', 'Встречи', 'ВКС, приглашения, календарь встреч', true, 'business', 20),
  ('chat', 'Чат', 'Общий и личные чаты команды', true, 'team', 30),
  ('gantt', 'Диаграмма Ганта', 'Таймлайн и экспорт MS Project', true, 'business', 40),
  ('calendar', 'Календарь', 'Месяц, неделя и день по задачам', true, 'team', 50),
  ('analytics', 'Аналитика', 'KPI, движение задач и отчёты', true, 'team', 60),
  ('notifications', 'Уведомления', 'Тосты, звук и браузерные уведомления', true, 'free', 70)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      min_plan = excluded.min_plan,
      sort_order = excluded.sort_order;

alter table public.feature_flags enable row level security;

drop policy if exists feature_flags_select_authenticated on public.feature_flags;
create policy feature_flags_select_authenticated on public.feature_flags
  for select to authenticated
  using (true);

revoke all on public.feature_flags from authenticated;
grant select on public.feature_flags to authenticated;

create or replace function public.set_feature_flag(p_key text, p_enabled boolean)
returns public.feature_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.feature_flags;
begin
  if public.current_role() <> 'admin' then
    raise exception 'feature_admin_required' using errcode = '42501';
  end if;

  update public.feature_flags
  set enabled = p_enabled,
      updated_by = auth.uid(),
      updated_at = now()
  where key = p_key
  returning * into v_row;

  if v_row.key is null then
    raise exception 'feature_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end $$;

revoke all on function public.set_feature_flag(text, boolean) from public;
grant execute on function public.set_feature_flag(text, boolean) to authenticated;

comment on table public.feature_flags is
  'Функциональные флаги: админ включает/выключает модули и платные функции.';

commit;
