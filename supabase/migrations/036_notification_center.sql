-- 036_notification_center.sql
-- Постоянные уведомления: центр, счетчик, прочитано, переходы к событиям.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  entity_type text,
  entity_id uuid,
  conversation_id uuid references public.conversations(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_insert_own
  on public.notifications for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.notifications to authenticated;

-- Новое сообщение в чате → уведомление всем участникам, кроме автора.
create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
begin
  select coalesce(full_name, 'Сотрудник') into author_name
  from public.profiles where id = new.author_id;

  insert into public.notifications (
    user_id, kind, title, body, entity_type, entity_id,
    conversation_id, dedupe_key
  )
  select
    cm.profile_id,
    'chat',
    coalesce(author_name, 'Сотрудник'),
    left(coalesce(new.body, ''), 180),
    'chat',
    new.conversation_id,
    new.conversation_id,
    'chat:' || new.id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.profile_id <> new.author_id
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists messages_notify_center on public.messages;
create trigger messages_notify_center
  after insert on public.messages
  for each row execute function public.notify_chat_message();

-- Realtime для счетчика и окна уведомлений.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
