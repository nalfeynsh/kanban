-- 042_team_boards.sql
-- Командная доска проекта: бесконечный холст, объекты, комментарии, голоса.
-- Одна доска на проект; доступ наследуется от проектa.

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  name text not null default 'Командная доска',
  edit_mode text not null default 'all' check (edit_mode in ('all', 'managers')),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_objects (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  type text not null check (type in ('sticky', 'text', 'shape', 'connector', 'drawing', 'image', 'frame')),
  data jsonb not null default '{}'::jsonb,
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 200,
  height double precision not null default 120,
  rotation double precision not null default 0,
  z integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_objects_board_idx
  on public.board_objects (board_id, z, created_at);

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  object_id uuid references public.board_objects(id) on delete cascade,
  x double precision,
  y double precision,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists board_comments_board_idx
  on public.board_comments (board_id, created_at);

create table if not exists public.board_votes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  object_id uuid not null references public.board_objects(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (board_id, object_id, created_by)
);

create index if not exists board_votes_object_idx
  on public.board_votes (board_id, object_id);

alter table public.boards enable row level security;
alter table public.board_objects enable row level security;
alter table public.board_comments enable row level security;
alter table public.board_votes enable row level security;

-- Доски: читают участники проекта, меняют руководители/админ.
drop policy if exists boards_select on public.boards;
create policy boards_select on public.boards
  for select to authenticated
  using (
    exists (select 1 from public.project_members m where m.project_id = boards.project_id and m.profile_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists boards_write on public.boards;
create policy boards_write on public.boards
  for all to authenticated
  using (
    exists (select 1 from public.project_members m where m.project_id = boards.project_id and m.profile_id = auth.uid() and m.role in ('owner', 'manager'))
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.project_members m where m.project_id = boards.project_id and m.profile_id = auth.uid() and m.role in ('owner', 'manager'))
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Объекты: читают участники; пишут все участники, если edit_mode = all,
-- иначе только owner/manager проекта и админ.
drop policy if exists board_objects_select on public.board_objects;
create policy board_objects_select on public.board_objects
  for select to authenticated
  using (exists (
    select 1 from public.boards b
    join public.project_members m on m.project_id = b.project_id
    where b.id = board_objects.board_id and m.profile_id = auth.uid()
  ) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists board_objects_write on public.board_objects;
create policy board_objects_write on public.board_objects
  for all to authenticated
  using (exists (
    select 1 from public.boards b
    join public.project_members m on m.project_id = b.project_id
    where b.id = board_objects.board_id
      and m.profile_id = auth.uid()
      and (b.edit_mode = 'all' or m.role in ('owner', 'manager'))
  ) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (
    select 1 from public.boards b
    join public.project_members m on m.project_id = b.project_id
    where b.id = board_objects.board_id
      and m.profile_id = auth.uid()
      and (b.edit_mode = 'all' or m.role in ('owner', 'manager'))
  ) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Комментарии: читают и создают участники проекта.
drop policy if exists board_comments_select on public.board_comments;
create policy board_comments_select on public.board_comments
  for select to authenticated
  using (exists (
    select 1 from public.boards b
    join public.project_members m on m.project_id = b.project_id
    where b.id = board_comments.board_id and m.profile_id = auth.uid()
  ) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists board_comments_write on public.board_comments;
create policy board_comments_write on public.board_comments
  for all to authenticated
  using (exists (
    select 1 from public.boards b
    join public.project_members m on m.project_id = b.project_id
    where b.id = board_comments.board_id and m.profile_id = auth.uid()
  ) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (
    select 1 from public.boards b
    join public.project_members m on m.project_id = b.project_id
    where b.id = board_comments.board_id and m.profile_id = auth.uid()
  ) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Голоса: читают участники, голосует каждый сам.
drop policy if exists board_votes_select on public.board_votes;
create policy board_votes_select on public.board_votes
  for select to authenticated
  using (exists (
    select 1 from public.boards b
    join public.project_members m on m.project_id = b.project_id
    where b.id = board_votes.board_id and m.profile_id = auth.uid()
  ) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists board_votes_write on public.board_votes;
create policy board_votes_write on public.board_votes
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

revoke all on public.boards from authenticated;
revoke all on public.board_objects from authenticated;
revoke all on public.board_comments from authenticated;
revoke all on public.board_votes from authenticated;
grant select, insert, update, delete on public.boards to authenticated;
grant select, insert, update, delete on public.board_objects to authenticated;
grant select, insert, update, delete on public.board_comments to authenticated;
grant select, insert, update, delete on public.board_votes to authenticated;

-- Медиа доски.
insert into storage.buckets (id, name, public, file_size_limit)
values ('board-media', 'board-media', true, 26214400)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "board_media_insert" on storage.objects;
create policy "board_media_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'board-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "board_media_delete" on storage.objects;
create policy "board_media_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'board-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "board_media_read" on storage.objects;
create policy "board_media_read"
  on storage.objects for select
  to public
  using (bucket_id = 'board-media');

-- Флаг модуля.
insert into public.feature_flags (key, name, description, enabled, min_plan, sort_order)
values ('whiteboard', 'Командная доска', 'Бесконечный холст, стикеры, фигуры, медиа', true, 'team', 45)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      min_plan = excluded.min_plan,
      sort_order = excluded.sort_order;

-- Realtime.
do $$ begin
  alter publication supabase_realtime add table public.board_objects;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.board_comments;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.board_votes;
exception when duplicate_object then null;
end $$;

-- Одна доска на проект: создаёт и возвращает доску для участника проекта.
create or replace function public.get_or_create_board(p_project uuid)
returns public.boards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board public.boards;
begin
  if not exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.profile_id = auth.uid()
  ) and not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'board_access_denied' using errcode = '42501';
  end if;

  insert into public.boards (project_id, created_by)
  values (p_project, auth.uid())
  on conflict (project_id) do nothing;

  select * into v_board from public.boards where project_id = p_project;
  return v_board;
end $$;

revoke all on function public.get_or_create_board(uuid) from public;
grant execute on function public.get_or_create_board(uuid) to authenticated;
