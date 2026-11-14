-- 029_default_project_membership.sql
-- Новые сотрудники автоматически попадают в основной проект «Мой Канбан»,
-- чтобы не потеряли доступ к общей доске после появления проектов.

create or replace function public.add_profile_to_default_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, profile_id, role)
  select p.id, new.id, 'member'
  from public.projects p
  where p.name = 'Мой Канбан'
  on conflict (project_id, profile_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_profile_default_project on public.profiles;
create trigger trg_profile_default_project
  after insert on public.profiles
  for each row execute function public.add_profile_to_default_project();
