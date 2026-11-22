-- 040_project_story_points.sql
-- Проект может измерять время в story points: норма SP в день.
alter table public.projects
  add column if not exists story_points_per_day numeric(4,1) default 2;
