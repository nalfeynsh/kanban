-- 045_project_task_features.sql
-- Отключаемые блоки в задачах на уровне проекта.
alter table public.projects add column if not exists task_planning_enabled boolean not null default true;
alter table public.projects add column if not exists task_milestones_enabled boolean not null default true;
alter table public.projects add column if not exists task_effort_enabled boolean not null default true;
alter table public.projects add column if not exists task_sprint_enabled boolean not null default true;
alter table public.projects add column if not exists task_dependencies_enabled boolean not null default true;
alter table public.projects add column if not exists task_relations_enabled boolean not null default true;
alter table public.projects add column if not exists task_checklist_enabled boolean not null default true;
