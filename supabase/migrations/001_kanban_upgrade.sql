-- ============================================================
--  «Мой Канбан» — миграция 001 (идемпотентная)
--  Выполнить в Supabase → SQL Editor → Run.
--  Скрипт можно запускать повторно: все операции защищены IF NOT EXISTS.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. ЗАДАЧИ: срок со временем, номер, приоритет, исполнитель
-- ------------------------------------------------------------
alter table public.tasks
  add column if not exists due_at      timestamptz,
  add column if not exists start_at    timestamptz,
  add column if not exists task_no     bigint,
  add column if not exists priority    smallint not null default 0,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists deleted_by  uuid references public.profiles(id) on delete set null;

-- Сквозная нумерация задач по дате создания (для существующих строк)
do $$
declare
  r record;
  n bigint := 0;
begin
  if not exists (select 1 from public.tasks where task_no is not null) then
    for r in select id from public.tasks order by created_at asc nulls first, id asc loop
      n := n + 1;
      update public.tasks set task_no = n where id = r.id;
    end loop;
  end if;
end $$;

create sequence if not exists public.tasks_no_seq;

select setval(
  'public.tasks_no_seq',
  coalesce((select max(task_no) from public.tasks), 0) + 1,
  false
);

alter table public.tasks alter column task_no set default nextval('public.tasks_no_seq');
alter sequence public.tasks_no_seq owned by public.tasks.task_no;

create unique index if not exists tasks_task_no_key on public.tasks (task_no);
create index if not exists tasks_column_position_idx on public.tasks (column_id, position);
create index if not exists tasks_deleted_at_idx on public.tasks (deleted_at);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists tasks_due_at_idx on public.tasks (due_at);

-- Переносим старую дату в срок, если срок ещё не задан
update public.tasks
set due_at = "date"::timestamptz
where due_at is null and "date" is not null;

-- Начало для диаграммы Ганта: по умолчанию — дата создания
update public.tasks
set start_at = coalesce(created_at, now())
where start_at is null;

create index if not exists tasks_start_at_idx on public.tasks (start_at);

-- Новым пользователям нужно право брать номер из последовательности
grant usage, select on sequence public.tasks_no_seq to authenticated;

-- ------------------------------------------------------------
-- 2. ПРОФИЛИ: telegram, роль, активность, должность
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists telegram       text,
  add column if not exists role           text not null default 'member',
  add column if not exists position_title text,
  add column if not exists is_active      boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('admin', 'manager', 'deputy', 'member'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. ПРИГЛАШЕНИЯ (закрытая регистрация)
-- ------------------------------------------------------------
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code       text,
  role       text not null default 'member',
  note       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at    timestamptz
);

create unique index if not exists invites_email_key
  on public.invites (lower(email))
  where used_at is null;

alter table public.invites enable row level security;

grant select, insert, update on public.invites to authenticated;

-- Читать приглашения могут только администраторы/менеджеры
drop policy if exists invites_read_staff on public.invites;
create policy invites_read_staff on public.invites
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  );

-- Создавать приглашения — администраторы
drop policy if exists invites_insert_admin on public.invites;
create policy invites_insert_admin on public.invites
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 4. ПРОВЕРКА ПРИГЛАШЕНИЯ (RPC для формы регистрации)
-- ------------------------------------------------------------
create or replace function public.verify_invite(p_email text, p_code text default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.invites i
    where lower(i.email) = lower(coalesce(p_email, ''))
      and i.used_at is null
      and (i.expires_at is null or i.expires_at > now())
      and (i.code is null or i.code = coalesce(p_code, ''))
  );
$$;

grant execute on function public.verify_invite(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. GUARD-ТРИГГЕР: без приглашения аккаунт не создаётся
-- ------------------------------------------------------------
create or replace function public.guard_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    raise exception 'Регистрация возможна только по подтверждённой почте из списка приглашённых';
  end if;

  if not exists (
    select 1
    from public.invites i
    where lower(i.email) = lower(new.email)
      and i.used_at is null
      and (i.expires_at is null or i.expires_at > now())
  ) then
    raise exception 'Доступ к сервису закрыт: ваша почта не в списке приглашённых';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_signup on auth.users;
create trigger guard_signup
  before insert on auth.users
  for each row execute function public.guard_signup();

-- Помечаем приглашение использованным и переносим роль из приглашения.
-- Имя триггера начинается с zz_, чтобы он срабатывал ПОСЛЕ стандартного
-- триггера создания профиля (порядок AFTER-триггеров — по алфавиту).
create or replace function public.consume_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invites
     set used_at = now()
   where lower(email) = lower(new.email)
     and used_at is null;

  update public.profiles
     set role = coalesce(
       (select i.role from public.invites i
         where lower(i.email) = lower(new.email)
         order by i.created_at desc limit 1),
       'member'
     )
   where id = new.id;

  return new;
end;
$$;

drop trigger if exists consume_invite on auth.users;
drop trigger if exists zz_consume_invite on auth.users;
create trigger zz_consume_invite
  after insert on auth.users
  for each row execute function public.consume_invite();

-- ------------------------------------------------------------
-- 5c. ПРОФИЛЬ ПРИ РЕГИСТРАЦИИ (email и Яндекс/OAuth)
--     Лечит ошибку «Database error saving new user»: старый
--     самописный триггер падал на OAuth-пользователе без почты
--     или без метаданных. Версия ниже безопасна: SECURITY DEFINER,
--     ON CONFLICT DO NOTHING, безопасные фолбэки для имени.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Сотрудник'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 5b. РОЛЬ И ПРАВА (SECURITY DEFINER — без рекурсии в RLS)
-- ------------------------------------------------------------
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'member'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Смена роли — только администратор (защита даже при прямом запросе к API)
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() is null → SQL Editor / service role
    if auth.uid() is null then
      return new;
    end if;
    if not public.is_admin() then
      raise exception 'Менять роль сотрудника может только администратор';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ------------------------------------------------------------
-- 6. RLS: задачи и профили
--    Правило архива = правило активной доски:
--    личная задача видна только автору, командная — всем.
-- ------------------------------------------------------------
alter table public.tasks enable row level security;
-- Пересоздаём политики, чтобы старые не открывали личные задачи
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tasks'
  loop
    execute format('drop policy if exists %I on public.tasks', pol.policyname);
  end loop;
end $$;

create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true)
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (is_private is not true or created_by = auth.uid())
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true)
  )
  with check (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true)
  );

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    (is_private is true and created_by = auth.uid())
    or (is_private is not true)
  );

alter table public.profiles enable row level security;

drop policy if exists profiles_select_team on public.profiles;
create policy profiles_select_team on public.profiles
  for select to authenticated
  using (true);

-- upsert своего профиля (иначе сохранение из модалки молча ничего не делает)
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Администратор может менять чужие профили (в первую очередь роль)
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- 7. КОЛОНКИ: читаем всем авторизованным, меняем администраторам
-- ------------------------------------------------------------
alter table public.columns enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'columns'
  loop
    execute format('drop policy if exists %I on public.columns', pol.policyname);
  end loop;
end $$;

create policy columns_select_team on public.columns
  for select to authenticated
  using (true);

drop policy if exists columns_write_admin on public.columns;
create policy columns_write_admin on public.columns
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

commit;

-- ============================================================
-- 8. ПРИМЕЧАНИЯ
-- ------------------------------------------------------------
-- • Публичная регистрация в Auth остаётся включённой: её закрывает
--   триггер guard_signup. Пользователь без приглашения получит
--   ошибку «Database error saving new user» — это ожидаемо.
--
-- • Первый администратор:
--     insert into public.invites (email, role, note)
--     values ('you@example.com', 'admin', 'bootstrap');
--
-- • Приглашение сотрудника (можно с кодом):
--     insert into public.invites (email, role, code, note)
--     values ('ivan@example.com', 'member', 'KANBAN-2026', 'Отдел разработки');
--
-- • В Supabase → Authentication → URL Configuration:
--     Site URL:       https://kanban.layero.app/
--     Redirect URLs:  https://kanban.layero.app/
--                     http://localhost:5173/**
--   (localhost — только для разработки, не для production)
-- ============================================================
